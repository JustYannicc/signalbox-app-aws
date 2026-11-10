/** Service destinations are code-owned; connection forms never choose outbound API hosts. */
export const identityEndpoints = ():
  | { readonly oidc: string; readonly portal: string }
  | undefined => undefined;
export const managedMcpEndpoint = "https://aws-mcp.us-east-1.api.aws/mcp";
