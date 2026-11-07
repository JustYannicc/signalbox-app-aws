import { accountRouter, defineApp, router, withApprovals } from "apps";
import { always } from "apps/operations/approval";
import { mcpRouter } from "apps/mcp";
import { endpoint } from "./provider.ts";
import { requirements } from "./requirements.ts";
import { connection } from "./connection.ts";
import { createOperations } from "./operations.ts";

export default defineApp(requirements, async ({ user, cache, signal }) => ({
  tools: router(
    await accountRouter(
      [...(user?.accounts.identityCenter ?? []), ...(user?.accounts.aws ?? [])],
      async (account) =>
        account.method === "identityCenter"
          ? router(createOperations(account.id))
          : withApprovals(
              await mcpRouter({
                url: endpoint,
                account,
                headers: account.headers(),
                cache,
                signal,
              }),
              () => always(),
            ),
      { signal },
    ),
    {
      title: "AWS",
      description:
        "Use your assigned AWS accounts and roles. Each task has its own target; production changes and opaque scripts ask for approval.",
    },
  ),
  connect: { identityCenter: connection },
}));
