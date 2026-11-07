import type { AwsApi } from "./api.ts";
import { ConnectionSection } from "./connection.tsx";
import { AccountsLink, Notice } from "./controls.tsx";

export function App({
  api,
  connections,
  accountsUrl,
}: {
  api: AwsApi;
  connections: readonly string[] | undefined;
  accountsUrl: string | undefined;
}) {
  return (
    <main className="page">
      <header className="intro">
        <h1>Your AWS accounts</h1>
        <p className="muted">
          Each task names its own account and role. A default is optional; it's used only when a
          task doesn't name an account.
        </p>
      </header>
      {connections === undefined ? (
        <Notice tone="warn" title="Couldn't read this page's connections">
          Reload the page. Your saved connections are unchanged.
        </Notice>
      ) : connections.length === 0 ? (
        <section className="connection empty" aria-labelledby="connect-heading">
          <div className="min0">
            <h2 id="connect-heading">IAM Identity Center</h2>
            <p className="muted">
              Connect your company's AWS access portal in Accounts. You sign in once with your usual
              company sign-in, then your assigned accounts and roles show here.
            </p>
          </div>
          {accountsUrl === undefined ? (
            <p className="muted">Open this app's Accounts tab to connect.</p>
          ) : (
            <AccountsLink href={accountsUrl} primary>
              Connect in Accounts
            </AccountsLink>
          )}
        </section>
      ) : (
        connections.map((id) => (
          <ConnectionSection key={id} api={api} id={id} accountsUrl={accountsUrl} />
        ))
      )}
    </main>
  );
}
