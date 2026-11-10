/** Private session state and public account inventory share stable AWS IDs. */
import { object, string, number, array, boolean, type Infer } from "apps";
import { ChoiceRequired } from "./safe-result.ts";
import { IdentitySessionSchema, PendingIdentitySessionSchema } from "./identity-client.ts";
export const Target = object({
  accountId: string({ minLength: 1 }),
  roleName: string({ minLength: 1 }),
});
export const InventoryAccount = object({
  accountId: string({ minLength: 1 }),
  accountName: string({ minLength: 1 }),
  roles: array(string({ minLength: 1 })),
  production: boolean(),
});
export const SavedSession = object({
  session: IdentitySessionSchema,
  accounts: array(InventoryAccount),
  defaultTarget: Target.optional(),
  reauthenticationRequired: boolean().optional(),
});
export type SavedSession = Infer<typeof SavedSession>;
export const PendingSession = object({
  ref: string({ minLength: 1 }),
  baseRevision: number().optional(),
  startUrl: string().optional(),
  region: string().optional(),
  pending: PendingIdentitySessionSchema.optional(),
  nextPollAt: number(),
});
export const guardedName = (name: string) => /(?:^|[^a-z])prod(?:uction)?(?:$|[^a-z])/iu.test(name);
export const assignedInventory = async (
  aws: ReturnType<typeof import("./identity-client.ts").makeIdentityCenter>,
  session: Infer<typeof IdentitySessionSchema>,
  previous: readonly Infer<typeof InventoryAccount>[] = [],
) => {
  const assigned = await aws.listAccounts(session),
    accounts: Infer<typeof InventoryAccount>[] = [];
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
