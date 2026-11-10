/** The host owns connection identity; AWS owns federation and session expiry. */
import { object, string, type Infer } from "apps";
import type { ConnectContext, InteractiveInstructions, InteractiveStatus } from "apps";
import { makeIdentityCenter, AwsIdentityError } from "./identity-client.ts";
import { identityEndpoints } from "./wire.ts";
import {
  newReference,
  readPrivate,
  writePrivate,
  removePrivate,
  claimPrivate,
} from "./session-store.ts";
import { SavedSession, PendingSession, assignedInventory } from "./identity-state.ts";
import type { requirements } from "./requirements.ts";
type Context = ConnectContext<typeof requirements>;
const Fields = object({ startUrl: string({ minLength: 1 }), region: string({ minLength: 1 }) });
const owner = (ctx: Context) => {
  if (!ctx.user.id) throw new Error("AWS sign-in needs a signed-in person.");
  return ctx.user.id;
};
const form = (previous?: {
  startUrl?: string | undefined;
  region?: string | undefined;
}): InteractiveInstructions => ({
  message:
    "Use your company's AWS access portal. AWS will take you to its normal sign-in, including Okta if your company uses it. Find the start URL in your AWS access portal; the Identity Center region is shown in its settings or your existing AWS SSO configuration. It can differ from your workload region.",
  form: {
    submitLabel: "Sign in to AWS",
    fields: [
      {
        name: "startUrl",
        label: "AWS start URL",
        type: "url",
        placeholder: "https://your-company.awsapps.com/start",
        ...(previous?.startUrl === undefined ? {} : { defaultValue: previous.startUrl }),
        description: "Use your company's AWS access portal address, ending in /start.",
      },
      {
        name: "region",
        label: "Identity Center region",
        type: "text",
        placeholder: "eu-west-1",
        ...(previous?.region === undefined ? {} : { defaultValue: previous.region }),
        description:
          "The region of your AWS sign-in directory, not the region of the resources you want to use.",
      },
    ],
  },
});
const waiting = (
  pending: NonNullable<Infer<typeof PendingSession>["pending"]>,
): InteractiveInstructions => ({
  url: pending.verificationUriComplete,
  code: pending.userCode,
  expiresAt: pending.expiresAt,
  message:
    "Continue in AWS. Your company may ask you to sign in with Okta. Keep this window open until sign-in finishes.",
});
const client = (ctx: Context, input: { region: string; startUrl: string }) =>
  makeIdentityCenter({ ...input, fetch: ctx.fetch, endpoints: identityEndpoints() });
const fail = (error: unknown): InteractiveStatus => ({
  state: "failed",
  message:
    error instanceof AwsIdentityError
      ? error.message
      : "AWS sign-in could not finish. Cancel and try again. Your saved connection and default are unchanged.",
});

export const connection = {
  start: async (ctx: Context, input: { method: string; ref?: string }) => {
    const person = owner(ctx),
      reference = input.ref ?? newReference();
    const saved =
      input.ref === undefined
        ? undefined
        : await readPrivate(ctx.sql, "identity_sessions", person, reference, SavedSession);
    if (input.ref !== undefined && saved === undefined)
      throw new Error("The saved AWS session is missing. Restore it before re-signing in.");
    const attempt = newReference();
    const previous = saved?.value.session;
    await writePrivate(ctx.sql, "identity_attempts", person, attempt, {
      ref: reference,
      baseRevision: saved?.revision,
      startUrl: previous?.startUrl,
      region: previous?.region,
      nextPollAt: 0,
    });
    return { session: attempt, ...form(previous) };
  },
  submit: async (
    ctx: Context,
    input: { method: string; session: string; value: string },
  ): Promise<InteractiveStatus> => {
    const person = owner(ctx),
      retained = await readPrivate(
        ctx.sql,
        "identity_attempts",
        person,
        input.session,
        PendingSession,
      );
    if (!retained) return { state: "failed", message: "This AWS sign-in ended. Start again." };
    if (retained.value.pending)
      return { state: "waiting", instructions: waiting(retained.value.pending) };
    let fields: Infer<typeof Fields>;
    try {
      fields = Fields.parse(JSON.parse(input.value));
    } catch {
      return {
        state: "waiting",
        instructions: { ...form(), message: "Enter the AWS start URL and Identity Center region." },
      };
    }
    const release = claimPrivate(
      ctx.sql,
      "identity_attempts",
      person,
      input.session,
      retained.revision,
    );
    try {
      const aws = client(ctx, fields),
        begun = await aws.begin(),
        pending = { ...begun.client, ...begun.device };
      await writePrivate(
        ctx.sql,
        "identity_attempts",
        person,
        input.session,
        {
          ...retained.value,
          startUrl: aws.startUrl,
          region: aws.region,
          pending,
          nextPollAt: Date.now() + pending.intervalSeconds * 1000,
        },
        retained.revision,
      );
      return { state: "waiting", instructions: waiting(pending) };
    } catch (error) {
      if (
        error instanceof AwsIdentityError &&
        ["invalid_start_url", "invalid_region", "wrong_region"].includes(error.failure)
      )
        return {
          state: "waiting",
          instructions: { ...form(fields), message: error.message },
        };
      return fail(error);
    } finally {
      release();
    }
  },
  status: async (
    ctx: Context,
    input: { method: string; session: string },
  ): Promise<InteractiveStatus> => {
    const person = owner(ctx),
      retained = await readPrivate(
        ctx.sql,
        "identity_attempts",
        person,
        input.session,
        PendingSession,
      );
    if (!retained) return { state: "failed", message: "This AWS sign-in ended. Start again." };
    const pending = retained.value.pending;
    if (!pending) return { state: "waiting", instructions: form(retained.value) };
    if (Date.now() < retained.value.nextPollAt || retained.busy)
      return { state: "waiting", instructions: waiting(pending) };
    const release = claimPrivate(
      ctx.sql,
      "identity_attempts",
      person,
      input.session,
      retained.revision,
    );
    try {
      const aws = client(ctx, pending),
        polled = await aws.poll(
          pending,
          pending.deviceCode,
          pending.intervalSeconds,
          pending.expiresAt,
        );
      if (polled.state === "pending") {
        await writePrivate(
          ctx.sql,
          "identity_attempts",
          person,
          input.session,
          {
            ...retained.value,
            pending: { ...pending, intervalSeconds: polled.retryAfterSeconds },
            nextPollAt: Date.now() + polled.retryAfterSeconds * 1000,
          },
          retained.revision,
        );
        return { state: "waiting", instructions: waiting(pending) };
      }
      const previous = await readPrivate(
        ctx.sql,
        "identity_sessions",
        person,
        retained.value.ref,
        SavedSession,
      );
      if (previous?.revision !== retained.value.baseRevision)
        return {
          state: "failed",
          message:
            "Your saved AWS connection changed during sign-in. Start re-sign-in again; the newer connection is unchanged.",
        };
      const accounts = await assignedInventory(aws, polled.session, previous?.value.accounts);
      await writePrivate(
        ctx.sql,
        "identity_sessions",
        person,
        retained.value.ref,
        { ...previous?.value, session: polled.session, accounts, reauthenticationRequired: false },
        retained.value.baseRevision,
      );
      removePrivate(ctx.sql, "identity_attempts", person, input.session);
      return {
        state: "connected",
        ref: retained.value.ref,
        accountInfo: { displayName: `AWS · ${new URL(aws.startUrl).hostname.split(".")[0]}` },
      };
    } catch (error) {
      if (error instanceof AwsIdentityError && error.retryable)
        return { state: "waiting", instructions: { ...waiting(pending), message: error.message } };
      return fail(error);
    } finally {
      release();
    }
  },
  cancel: async (ctx: Context, input: { session: string }) => {
    removePrivate(ctx.sql, "identity_attempts", owner(ctx), input.session);
  },
  remove: async (ctx: Context, input: { ref: string }) => {
    removePrivate(ctx.sql, "identity_sessions", owner(ctx), input.ref);
  },
  check: async (ctx: Context, input: { ref: string }) => {
    const saved = await readPrivate(
      ctx.sql,
      "identity_sessions",
      owner(ctx),
      input.ref,
      SavedSession,
    );
    if (!saved) throw new Error("Your saved AWS session is missing. Re-sign in.");
    const aws = client(ctx, saved.value.session);
    const session =
      saved.value.session.accessTokenExpiresAt <= Date.now()
        ? await aws.refresh(saved.value.session)
        : saved.value.session;
    await aws.listAccounts(session);
    if (session !== saved.value.session)
      await writePrivate(
        ctx.sql,
        "identity_sessions",
        owner(ctx),
        input.ref,
        { ...saved.value, session },
        saved.revision,
      );
    return {};
  },
};
