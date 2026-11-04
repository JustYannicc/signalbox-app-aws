import { accountRouter, defineApp, router, withApprovals } from "apps";
import { always } from "apps/operations/approval";
import { mcpRouter } from "apps/mcp";
import { aws, endpoint } from "./provider.js";
import { icons } from "./icon.js";

const requirements = { user: { accounts: { aws: aws.many() } }, icons };

export default defineApp(requirements, async ({ user, cache, signal }) => ({
  tools: router(
    await accountRouter(
      user?.accounts.aws ?? [],
      async (account) =>
        withApprovals(
          await mcpRouter({ url: endpoint, account, headers: account.headers(), cache, signal }),
          // AWS's API and script tools can write across services, even when a name looks like a read.
          () => always(),
        ),
      { signal },
    ),
    {
      title: "AWS",
      description: "Use AWS services through the official AWS MCP server with each person's own permissions. Every tool call asks for approval.",
      icons,
    },
  ),
}));
