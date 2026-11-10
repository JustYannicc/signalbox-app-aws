/** Every request resolves its own AWS account and role before acquiring temporary credentials. */
import {
  mutation,
  query,
  object,
  string,
  boolean,
  record,
  json,
  type MutationContext,
  type QueryContext,
} from "apps";
import { callMcpTool } from "apps/mcp";
import { never } from "apps/operations/approval";
import { AwsClient } from "./vendor/aws4fetch.js";
import { requirements } from "./requirements.ts";
import { managedMcpEndpoint } from "./wire.ts";
import { writePrivate } from "./session-store.ts";
import { assignedInventory, resolveTarget } from "./identity-state.ts";
import { safeResult, ChoiceRequired } from "./safe-result.ts";
import { load, fresh, sessionRequest, awsFor, publicConnection } from "./saved-connection.ts";
type Context = MutationContext<typeof requirements>;
type ReadContext = QueryContext<typeof requirements>;
export const createOperations = (connectionId: string) => {
  const inventory = query(
    {
      input: object({}),
      description:
        "Your AWS account and role assignments, saved default and production guards. Session secrets are never returned.",
    },
    async (ctx: ReadContext) =>
      safeResult(async () => {
        const connections = [];
        for (const account of ctx.user.accounts.identityCenter) {
          if (account.method !== "identityCenter") continue;
          if (account.id !== connectionId) continue;
          const saved = await load(ctx, account.id);
          connections.push(publicConnection(account.id, saved.value));
        }
        return { connections };
      }),
  );
  const refresh = mutation(
    {
      approval: never(),
      input: object({}),
      description:
        "Refresh the accounts and roles AWS assigns to this connection. Retains its default and production classifications.",
    },
    async (ctx: Context) =>
      safeResult(async () => {
        const stored = await fresh(ctx, connectionId),
          accounts = await sessionRequest(ctx, stored, () =>
            assignedInventory(
              awsFor(ctx, stored.value),
              stored.value.session,
              stored.value.accounts,
            ),
          );
        const value = { ...stored.value, accounts };
        await writePrivate(
          ctx.sql,
          "identity_sessions",
          stored.owner,
          stored.reference,
          value,
          stored.revision,
        );
        return publicConnection(stored.account.id, value);
      }),
  );
  const setDefault = mutation(
    {
      approval: never(),
      input: object({ accountId: string().optional(), roleName: string().optional() }),
      description:
        "Explicitly save an assigned AWS account and role as your default, or omit both to clear it.",
    },
    async (ctx: Context, input) =>
      safeResult(async () => {
        const stored = await load(ctx, connectionId);
        if ((input.accountId === undefined) !== (input.roleName === undefined))
          throw new ChoiceRequired("Choose both an AWS account and role, or clear both.");
        const target =
          input.accountId === undefined
            ? undefined
            : resolveTarget(stored.value, input.accountId, input.roleName);
        const { defaultTarget: _old, ...rest } = stored.value;
        const value = {
          ...rest,
          ...(target === undefined
            ? {}
            : {
                defaultTarget: { accountId: target.account.accountId, roleName: target.roleName },
              }),
        };
        await writePrivate(
          ctx.sql,
          "identity_sessions",
          stored.owner,
          stored.reference,
          value,
          stored.revision,
        );
        return publicConnection(stored.account.id, value);
      }),
  );
  const setProduction = mutation(
    {
      approval: never(),
      input: object({ accountId: string(), production: boolean() }),
      description:
        "Set a production guard by stable AWS account ID. Renaming the account never changes this choice.",
    },
    async (ctx: Context, input) =>
      safeResult(async () => {
        const stored = await load(ctx, connectionId);
        if (!stored.value.accounts.some((account) => account.accountId === input.accountId))
          throw new ChoiceRequired("Choose an assigned AWS account.");
        const value = {
          ...stored.value,
          accounts: stored.value.accounts.map((account) =>
            account.accountId === input.accountId
              ? { ...account, production: input.production }
              : account,
          ),
        };
        await writePrivate(
          ctx.sql,
          "identity_sessions",
          stored.owner,
          stored.reference,
          value,
          stored.revision,
        );
        return publicConnection(stored.account.id, value);
      }),
  );
  const callInput = object({
    account: string().optional(),
    role: string().optional(),
    arguments: record(json()),
  });
  const callTool = (name: "get_tasks" | "run_script" | "get_presigned_url") =>
    mutation(
      {
        // The handler requires native consent after resolving the AWS target and saved revision.
        // An earlier generic prompt cannot bind that target or detect re-sign-in while waiting.
        approval: never(),
        input: callInput,
        description: `AWS ${name}. Choose an assigned account name or ID and role for this task. Only an explicitly saved default may fill an omitted target. Scripts and presigned URLs require human approval of the exact target and arguments.`,
      },
      async (ctx: Context, input) =>
        safeResult(async () => {
          const stored = await fresh(ctx, connectionId),
            aws = awsFor(ctx, stored.value);
          const accounts = await sessionRequest(ctx, stored, () =>
            assignedInventory(aws, stored.value.session, stored.value.accounts),
          );
          const state = { ...stored.value, accounts },
            target = resolveTarget(state, input.account, input.role);
          const receipt = {
            connection: stored.account.id,
            accountId: target.account.accountId,
            accountName: target.account.accountName,
            roleName: target.roleName,
            production: target.account.production,
            operation: name,
            arguments: input.arguments,
          };
          // Opaque scripts can change any service. An agent's read-only claim never bypasses consent.
          if (name !== "get_tasks") {
            const decision = await ctx.elicit({
              mode: "form",
              message: `Approve this AWS operation?\n${JSON.stringify(receipt, null, 2)}`,
              requestedSchema: { type: "object", properties: {} },
            });
            if (
              decision.action !== "accept" ||
              (decision.content !== undefined && Object.keys(decision.content).length !== 0)
            )
              return { state: "denied", target: receipt };
            const current = await load(ctx, connectionId);
            if (current.revision !== stored.revision)
              throw new ChoiceRequired(
                "Your AWS connection or settings changed while approval was pending. Review and approve a fresh request.",
              );
          }
          const credentials = await sessionRequest(ctx, stored, () =>
            aws.getRoleCredentials(stored.value.session, target.account.accountId, target.roleName),
          );
          const signer = new AwsClient({
            ...credentials,
            service: "aws-mcp",
            region: "us-east-1",
            fetch: ctx.fetch,
          });
          const result = await callMcpTool(
            {
              url: managedMcpEndpoint,
              accountId: stored.account.id,
              signal: ctx.signal,
              signRequest: (request) => signer.sign(request),
            },
            name,
            input.arguments,
            { elicit: ctx.elicit },
          );
          return { target: receipt, result };
        }),
    );
  const get_tasks = callTool("get_tasks"),
    run_script = callTool("run_script"),
    get_presigned_url = callTool("get_presigned_url");

  return {
    inventory,
    refresh,
    setDefault,
    setProduction,
    get_tasks,
    run_script,
    get_presigned_url,
  };
};
