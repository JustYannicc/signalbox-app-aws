import { bearer, defineProvider, interactive, oauth2 } from "apps";
import { mcpHealth } from "apps/mcp";

export const endpoint = "https://aws-mcp.us-east-1.api.aws/mcp";

export const aws = defineProvider({
  name: "AWS",
  hosts: ["aws-mcp.us-east-1.api.aws"],
  auth: {
    oauth: oauth2({
      discover: endpoint,
      resource: endpoint,
      loopbackRedirectUri: "http://127.0.0.1:43119/oauth/callback",
      scopes: [],
      tokenEndpointAuthMethod: "none",
      request: ({ access_token }) => bearer(access_token),
    }),
  },
  health: (check) => mcpHealth(check, { url: endpoint, headers: check.account.headers() }),
});

/** Identity Center is a different credential contract; the original OAuth provider stays intact. */
export const identityCenter = defineProvider({
  name: "AWS IAM Identity Center",
  hosts: ["*.amazonaws.com", "*.api.aws"],
  auth: { identityCenter: interactive({ label: "AWS Identity Center", reconnect: true }) },
});
