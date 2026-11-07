/** Private session state and public account inventory share stable AWS IDs. */
import { Schema } from "effect";
import { ChoiceRequired } from "./safe-result.ts";
import { IdentitySessionSchema, PendingIdentitySessionSchema } from "./identity-client.ts";
export const Target = Schema.Struct({
  accountId: Schema.NonEmptyString,
  roleName: Schema.NonEmptyString,
});
export const InventoryAccount = Schema.Struct({
  accountId: Schema.NonEmptyString,
  accountName: Schema.NonEmptyString,
  roles: Schema.Array(Schema.NonEmptyString),
  production: Schema.Boolean,
});
export const SavedSession = Schema.Struct({
  session: IdentitySessionSchema,
  accounts: Schema.Array(InventoryAccount),
  defaultTarget: Schema.optionalKey(Target),
  reauthenticationRequired: Schema.optionalKey(Schema.Boolean),
});
export type SavedSession = typeof SavedSession.Type;
export const PendingSession = Schema.Struct({
  ref: Schema.NonEmptyString,
  baseRevision: Schema.optionalKey(Schema.Number),
  startUrl: Schema.optionalKey(Schema.String),
  region: Schema.optionalKey(Schema.String),
  pending: Schema.optionalKey(PendingIdentitySessionSchema),
  nextPollAt: Schema.Number,
});
export const guardedName = (name: string) => /(?:^|[^a-z])prod(?:uction)?(?:$|[^a-z])/iu.test(name);
export const assignedInventory = async (
  aws: ReturnType<typeof import("./identity-client.ts").makeIdentityCenter>,
  session: typeof IdentitySessionSchema.Type,
  previous: readonly (typeof InventoryAccount.Type)[] = [],
) => {
  const assigned = await aws.listAccounts(session),
    accounts: (typeof InventoryAccount.Type)[] = [];
  const seen = new Set<string>();
  for (const account of assigned) {
    if (seen.has(account.accountId))
      throw new ChoiceRequired("AWS returned a duplicate account assignment. Refresh and retry.");
    seen.add(account.accountId);
    const old = previous.find((saved) => saved.accountId === account.accountId);
    const roles = await aws.listRoles(session, account.accountId);
    accounts.push({
      accountId: account.accountId,
      accountName: account.accountName,
      roles: [...new Set(roles.map((role) => role.roleName))],
      production: old?.production ?? guardedName(account.accountName),
    });
  }
  return accounts;
};
/** Resolve the target once per call. A missing or ambiguous name never chooses another account. */
export const resolveTarget = (state: SavedSession, account?: string, role?: string) => {
  if (account === undefined && role !== undefined)
    throw new ChoiceRequired("Choose an AWS account with that role.");
  const selection = account === undefined ? state.defaultTarget : undefined;
  if (account === undefined && selection === undefined)
    throw new ChoiceRequired(
      "Choose an AWS account and role for this task, or save a default first.",
    );
  const name = account ?? selection?.accountId;
  const matches = state.accounts.filter(
    (item) =>
      item.accountId === name || item.accountName.toLocaleLowerCase() === name?.toLocaleLowerCase(),
  );
  if (matches.length !== 1)
    throw new ChoiceRequired(
      matches.length === 0
        ? "That AWS account is not assigned to you. Refresh accounts or choose another account."
        : "More than one AWS account has that name. Choose its account ID.",
    );
  const selected = matches[0];
  if (selected === undefined) throw new ChoiceRequired("Choose an assigned AWS account.");
  const chosenRole =
    role ?? selection?.roleName ?? (selected.roles.length === 1 ? selected.roles[0] : undefined);
  if (chosenRole === undefined)
    throw new ChoiceRequired("Choose an assigned role for this AWS account.");
  if (!selected.roles.includes(chosenRole))
    throw new ChoiceRequired(
      "That AWS role is no longer assigned to you. Refresh accounts or choose another role.",
    );
  return { account: selected, roleName: chosenRole };
};
