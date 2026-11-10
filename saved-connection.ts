/** Saved connection ownership, refresh and visible recovery state. */
import type { MutationContext, QueryContext } from "apps";
import { requirements } from "./requirements.ts";
import { makeIdentityCenter } from "./identity-client.ts";
import { AwsIdentityError } from "./errors.ts";
import { identityEndpoints } from "./wire.ts";
import { readPrivate, writePrivate, claimPrivate } from "./session-store.ts";
import { SavedSession } from "./identity-state.ts";
import { ChoiceRequired } from "./safe-result.ts";
type Context = MutationContext<typeof requirements>;
type ReadContext = QueryContext<typeof requirements>;
const accountFor = (ctx: ReadContext, connection?: string) => {
  const accounts = ctx.user.accounts.identityCenter.filter(
    (account) => account.method === "identityCenter",
  );
  const matches =
    connection === undefined ? accounts : accounts.filter((account) => account.id === connection);
  if (matches.length !== 1)
    throw new ChoiceRequired(
      matches.length === 0
        ? "Connect AWS Identity Center in Accounts first."
        : "Choose the saved AWS connection for this task.",
    );
  const account = matches[0];
  if (account?.method !== "identityCenter")
    throw new ChoiceRequired("Choose an AWS Identity Center connection.");
  if (!ctx.user.id) throw new ChoiceRequired("Sign in to use your AWS connection.");
  return { account, owner: ctx.user.id, reference: account.fields.ref };
};
export const load = async (ctx: ReadContext, connection?: string) => {
  const selected = accountFor(ctx, connection),
    stored = await readPrivate(
      ctx.sql,
      "identity_sessions",
      selected.owner,
      selected.reference,
      SavedSession,
    );
  if (!stored) throw new AwsIdentityError("session_expired", false);
  return { ...selected, ...stored };
};
/** Keep the connection and choices when AWS revokes a session. A newer sign-in wins the revision check. */
export const sessionRequest = async <A>(
  ctx: Context,
  stored: Awaited<ReturnType<typeof load>>,
  work: () => Promise<A>,
) => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AwsIdentityError && error.failure === "session_expired")
      await writePrivate(
        ctx.sql,
        "identity_sessions",
        stored.owner,
        stored.reference,
        { ...stored.value, reauthenticationRequired: true },
        stored.revision,
      );
    throw error;
  }
};
export const awsFor = (ctx: ReadContext, state: SavedSession) =>
  makeIdentityCenter({ ...state.session, fetch: ctx.fetch, endpoints: identityEndpoints() });
/** Refresh has one claim. A failed or concurrent refresh never replaces a newer saved session. */
export const fresh = async (ctx: Context, connection?: string) => {
  let stored = await load(ctx, connection);
  if (stored.value.reauthenticationRequired) throw new AwsIdentityError("session_expired", false);
  if (stored.value.session.accessTokenExpiresAt > Date.now() + 30_000) return stored;
  const release = claimPrivate(
    ctx.sql,
    "identity_sessions",
    stored.owner,
    stored.reference,
    stored.revision,
  );
  try {
    const session = await sessionRequest(ctx, stored, () =>
      awsFor(ctx, stored.value).refresh(stored.value.session),
    );
    await writePrivate(
      ctx.sql,
      "identity_sessions",
      stored.owner,
      stored.reference,
      { ...stored.value, session },
      stored.revision,
    );
    stored = await load(ctx, connection);
    return stored;
  } finally {
    release();
  }
};
export const publicConnection = (connection: string, state: SavedSession) => ({
  connection,
  startUrl: state.session.startUrl,
  region: state.session.region,
  expiresAt: state.session.accessTokenExpiresAt,
  accounts: state.accounts,
  defaultTarget: state.defaultTarget ?? null,
  state:
    !state.reauthenticationRequired &&
    (state.session.accessTokenExpiresAt > Date.now() ||
      (state.session.refreshToken !== undefined &&
        state.session.clientSecretExpiresAt * 1000 > Date.now() &&
        (state.session.refreshTokenExpiresAt === undefined ||
          state.session.refreshTokenExpiresAt > Date.now())))
      ? "connected"
      : "session_expired",
});
