import type { ReactNode } from "react";
import type { Problem } from "./model.ts";

/** Opens the host's Accounts page, which owns sign-in, re-sign-in and disconnecting. */
export function AccountsLink({
  href,
  children,
  primary = false,
}: {
  href: string | undefined;
  children: ReactNode;
  primary?: boolean;
}) {
  if (href === undefined) return null;
  return (
    <a
      className={primary ? "button primary" : "button quiet"}
      href={href}
      target="_blank"
      rel="noopener"
    >
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

export function Notice({
  tone,
  title,
  children,
  actions,
}: {
  tone: "warn" | "good";
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`}>
      {title !== undefined && <strong className="noticetitle">{title}</strong>}
      <p>{children}</p>
      {actions !== undefined && <div className="noticeactions">{actions}</div>}
    </div>
  );
}

const titles: Readonly<Record<string, string>> = {
  session_expired: "Sign in to AWS again",
  access_denied: "AWS refused this account or role",
  no_access: "No AWS accounts available",
  rate_limited: "AWS is busy",
  unavailable: "AWS is unavailable",
  request_failed: "AWS couldn't finish",
  invalid_response: "Unexpected response",
  choice_required: "Choose again",
  transport: "Couldn't load this connection",
};
/** States the host's Accounts page resolves: re-sign-in, reconnecting or checking the identity. */
const managed = new Set(["session_expired", "no_access", "access_denied", "transport"]);

/**
 * A recoverable failure. `retained` says the last good inventory is still shown below it.
 * `onRetry` repeats the failed read or refresh; a failed write is repeated by the person.
 */
export function ProblemNotice({
  problem,
  retained,
  onRetry,
  accountsUrl,
}: {
  problem: Problem;
  retained: boolean;
  onRetry?: (() => void) | undefined;
  accountsUrl: string | undefined;
}) {
  const action =
    problem.state === "session_expired"
      ? "Sign in again"
      : managed.has(problem.state)
        ? "Manage connection"
        : undefined;
  return (
    <Notice
      tone="warn"
      title={titles[problem.state] ?? "Something went wrong"}
      actions={
        (onRetry !== undefined && problem.retryable) ||
        (action !== undefined && accountsUrl !== undefined) ? (
          <>
            {onRetry !== undefined && problem.retryable && (
              <button type="button" onClick={onRetry}>
                Try again
              </button>
            )}
            {action !== undefined && <AccountsLink href={accountsUrl}>{action}</AccountsLink>}
          </>
        ) : undefined
      }
    >
      {problem.message}
      {retained && " Your saved accounts and choices are shown below."}
    </Notice>
  );
}
