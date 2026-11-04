# AWS

Use the official AWS-managed MCP server with your own AWS identity. AWS applies your existing IAM permissions and organization policies to reads and writes across its services. Signalbox does not create roles, apps or infrastructure in your company's account.

Connect, sign in to AWS, then copy the full address from the browser's localhost page and paste it into the connection form. No local listener or desktop app is needed. The cloud retains OAuth state and the PKCE verifier, validates the pasted address and exchanges the code. There is no access-key sign-in method. Your organization can restrict OAuth consent through IAM policy.

The OAuth resource is the managed AWS MCP server. AWS advertises no OAuth scope strings; the app requests no scope strings and does not request an administrator role. AWS documents `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token` as the permissions needed to consent. The app does not change these permissions for you.

Each person can link multiple accounts. Tool calls choose one of that person's linked accounts. Tokens go only to the managed AWS MCP endpoint. Health checks initialize and list tools with and without credentials; they do not invoke an AWS operation. Tools come from the server rather than a fixed two-operation subset. Every tool call asks for approval because the API and script tools can perform writes. Approval does not expand the AWS identity's authority.

## References

- [Set up the AWS MCP Server](https://docs.aws.amazon.com/agent-toolkit/latest/userguide/getting-started-aws-mcp-server.html)
- [OAuth access and approved clients](https://docs.aws.amazon.com/signin/latest/userguide/aws-mcp-server.html)
