# AWS

Use the official AWS-managed MCP server with your own AWS identity. AWS applies your IAM permissions and organization policies. Connecting does not create roles or infrastructure in your AWS accounts.

## AWS IAM Identity Center

In Accounts, connect AWS IAM Identity Center with your company's AWS access portal URL and its Identity Center region. Continue through AWS and your usual company sign-in, including Okta when configured. Keep the connection open until sign-in finishes.

The AWS page lists your assigned accounts and roles. Choose an account and role for each task. You can save a default, clear it, and change which accounts are marked as production. An account's production choice follows its AWS account ID when its name changes. Check access sends a read with the account and role you selected and shows the resulting target.

Agents can read tasks, run scripts and request presigned URLs through the managed MCP server. Scripts and presigned URLs ask for approval of the exact account, role and arguments on every account. Declining sends no AWS operation. A changed connection or setting requires a fresh approval. AWS still decides what the chosen role may do.

Refresh accounts updates assignments. If a role disappears, choose another assigned role. A temporary outage keeps your connection and choices. When AWS requires sign-in again, use Manage connection in Accounts; re-sign-in retains the saved account, its name and links. Cancelling keeps the previous sign-in. Disconnect through Accounts when you want to remove saved access.

Identity Center sessions stay encrypted on the server. Temporary role credentials are acquired for each call, used to sign its requests and never returned in tool results.

## Existing AWS OAuth connections

Existing AWS OAuth accounts remain available with their original tools and links. They do not become Identity Center accounts; connect Identity Center separately to use the account and role picker.

For OAuth, sign in to AWS, copy the full address from the browser's localhost page and paste it into the connection form. No local listener or desktop app is needed. The server retains OAuth state and the PKCE verifier, validates the pasted address and exchanges the code. There is no access-key sign-in method.

The OAuth resource is the managed AWS MCP server. AWS advertises no OAuth scope strings, and the app requests no administrator role. AWS documents `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token` as the consent permissions. Your organization can restrict consent through IAM policy.

OAuth tools come from the managed server. Every call asks for approval because its API and script tools can perform writes. Approval does not expand your AWS identity's authority.

## References

- [IAM Identity Center device authorization](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_StartDeviceAuthorization.html)
- [Assigned AWS accounts and roles](https://docs.aws.amazon.com/singlesignon/latest/PortalAPIReference/Welcome.html)
- [Set up the AWS MCP Server](https://docs.aws.amazon.com/agent-toolkit/latest/userguide/getting-started-aws-mcp-server.html)
- [OAuth access and approved clients](https://docs.aws.amazon.com/signin/latest/userguide/aws-mcp-server.html)
