import { useId } from "react";
import type { AwsApi } from "./api.ts";
import { AccessCheck } from "./access-check.tsx";
import { useConnection, type ConnectionState } from "./connection-state.ts";
import { AccountsLink, Notice, ProblemNotice } from "./controls.tsx";
import { Inventory } from "./inventory.tsx";
import { accountCount, portalName } from "./model.ts";

function Status({ state }: { state: ConnectionState }) {
  if (state.value === undefined) return null;
  if (state.value.expired) return <div className="status expired">Sign-in expired</div>;
  return <div className="status">{state.loading ? "Connected · updating…" : "Connected"}</div>;
}

/** One saved Identity Center connection: its real account and role inventory and the choices on it. */
export function ConnectionSection({
  api,
  id,
  accountsUrl,
}: {
  api: AwsApi;
  id: string;
  accountsUrl: string | undefined;
}) {
  const connection = useConnection(api, id);
  const { state } = connection;
  const { value, problem, busy } = state;
  const headingId = useId();
  const retry =
    problem?.source === "load"
      ? connection.load
      : problem?.source === "refresh"
        ? connection.refresh
        : undefined;
  return (
    <section className="connection" aria-labelledby={headingId}>
      <div className="connectionhead">
        <div className="min0">
          <h2 id={headingId}>
            {value === undefined ? "AWS connection" : portalName(value.startUrl)}
          </h2>
          <small>
            IAM Identity Center
            {value !== undefined && ` · ${value.region} · ${accountCount(value.accounts.length)}`}
          </small>
          {value !== undefined && <small className="url">{value.startUrl}</small>}
          <Status state={state} />
        </div>
        <div className="headactions">
          {value !== undefined && (
            <button
              type="button"
              className="quiet"
              onClick={connection.refresh}
              disabled={busy !== undefined}
            >
              {busy?.kind === "refresh" ? "Refreshing…" : "Refresh accounts"}
            </button>
          )}
          <AccountsLink href={accountsUrl}>Manage connection</AccountsLink>
        </div>
      </div>

      {problem !== undefined && (
        <ProblemNotice
          problem={problem.problem}
          retained={value !== undefined}
          onRetry={busy === undefined ? retry : undefined}
          accountsUrl={accountsUrl}
        />
      )}
      {problem === undefined && value?.expired === true && (
        <Notice
          tone="warn"
          title="Sign in to AWS again"
          actions={
            accountsUrl === undefined ? undefined : (
              <AccountsLink href={accountsUrl}>Sign in again</AccountsLink>
            )
          }
        >
          Your AWS sign-in has expired. Your accounts, default and production choices are saved.
          Refresh accounts to renew it, or sign in again from Accounts.
        </Notice>
      )}

      {value === undefined ? (
        state.loading &&
        problem === undefined && <p className="muted loading">Loading your AWS accounts…</p>
      ) : value.accounts.length === 0 ? (
        <Notice tone="warn" title="No AWS accounts available">
          Sign-in worked, but AWS returned no assigned accounts. Check that you signed in with your
          work identity, then refresh accounts.
        </Notice>
      ) : (
        <>
          <Inventory
            connection={value}
            busy={busy}
            onSetDefault={connection.setDefault}
            onSetProduction={connection.setProduction}
          />
          <AccessCheck
            connection={value}
            busy={busy}
            result={state.check}
            onCheck={connection.check}
          />
        </>
      )}

      <div role="status" aria-live="polite" className="live">
        {state.notice !== undefined && <p className="notice good">{state.notice}</p>}
      </div>
    </section>
  );
}
