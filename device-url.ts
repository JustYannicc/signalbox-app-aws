/**
 * AWS-owned pages a device sign-in may send a person to. The OIDC service names the page, but
 * Basalt shows it as a link, so only exact AWS hosts in the connection's own region pass.
 *
 * - Current: `https://ssoins-<instance id>.<region>.portal.amazonaws.com/#/device?user_code=…`
 * - Legacy: `https://device.sso.<region>.amazonaws.com/?user_code=…`
 */
// Instance IDs use [a-zA-Z0-9-.]{16}; a dot would add a DNS label and URL lowercases hosts.
const instancePortal = /^ssoins-[a-z0-9-]{16}\.([a-z0-9-]+)\.portal\.amazonaws\.com$/u;
const userCode = /^[A-Za-z0-9-]+$/u;

/** The parsed page when `value` is an AWS device sign-in page for `region`; otherwise undefined. */
export const deviceVerificationUrl = (
  value: string,
  region: string,
  kind: "page" | "complete",
): URL | undefined => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  )
    return undefined;
  if (url.hostname === `device.sso.${region}.amazonaws.com`) return url;
  if (instancePortal.exec(url.hostname)?.[1] !== region) return undefined;
  if (url.pathname !== "/" || url.search !== "") return undefined;
  const fragment = /^#\/device(?:\?user_code=([^&#]*))?$/u.exec(url.hash);
  if (fragment === null) return undefined;
  const code = fragment[1];
  if (code === undefined) return kind === "page" ? url : undefined;
  return userCode.test(code) ? url : undefined;
};
