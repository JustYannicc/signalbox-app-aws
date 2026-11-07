import { useId, useState } from "react";
import type { Busy, ConnectionState } from "./connection-state.ts";
import type { AwsConnection, Receipt, Target } from "./model.ts";

function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <div className="receipt">
      <strong className={receipt.failed ? "refused" : "check"}>
        {receipt.failed ? "AWS refused the request" : "Access works"}
      </strong>
      <dl>
        <dt>Account</dt>
        <dd>
          {receipt.accountName}
          <br />
          <small>{receipt.accountId}</small>
        </dd>
        <dt>Role</dt>
        <dd>{receipt.roleName}</dd>
        <dt>Production</dt>
        <dd>{receipt.production ? "Yes" : "No"}</dd>
        <dt>Operation</dt>
        <dd>
          <code>{receipt.operation}</code>
        </dd>
        <dt>Arguments</dt>
        <dd>
          <code>{receipt.arguments}</code>
        </dd>
        <dt>Connection</dt>
        <dd>
          <code>{receipt.connection}</code>
        </dd>
      </dl>
      {receipt.text.length === 0 ? (
        <p className="note">AWS returned no text.</p>
      ) : (
        <details className="help">
          <summary>AWS response</summary>
          <pre>{receipt.text.join("\n\n")}</pre>
        </details>
      )}
    </div>
  );
}

/**
 * Sends one real get_tasks read with the chosen account and role and shows what AWS ran it as.
 * Nothing here selects a target for later tasks; that's what the default is for.
 */
export function AccessCheck({
  connection,
  busy,
  result,
  onCheck,
}: {
  connection: AwsConnection;
  busy: Busy | undefined;
  result: ConnectionState["check"];
  onCheck: (target: Target) => void;
}) {
  const id = useId();
  const [accountId, setAccountId] = useState("");
  const [roleChoice, setRoleChoice] = useState("");
  const account = connection.accounts.find((item) => item.accountId === accountId);
  const role =
    account === undefined
      ? ""
      : account.roles.includes(roleChoice)
        ? roleChoice
        : account.roles.length === 1
          ? (account.roles[0] ?? "")
          : "";
  const checking = busy?.kind === "check";
  return (
    <section className="access" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>Check access</h3>
      <p className="muted">
        Sends one read-only AWS request with exactly this account and role and shows what AWS ran it
        as. Your default stays unchanged.
      </p>
      <form
        className="fields"
        onSubmit={(event) => {
          event.preventDefault();
          if (account !== undefined && role !== "")
            onCheck({ accountId: account.accountId, roleName: role });
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-account`}>Account</label>
          <select
            id={`${id}-account`}
            value={accountId}
            required
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">Choose an account</option>
            {connection.accounts.map((item) => (
              <option key={item.accountId} value={item.accountId}>
                {item.accountName} · {item.accountId}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-role`}>Role</label>
          <select
            id={`${id}-role`}
            value={role}
            required
            disabled={account === undefined}
            onChange={(event) => setRoleChoice(event.target.value)}
          >
            <option value="">
              {account === undefined ? "Choose an account first" : "Choose a role"}
            </option>
            {account?.roles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="primary"
          disabled={busy !== undefined || account === undefined || role === ""}
        >
          {checking ? "Checking…" : "Check selected access"}
        </button>
      </form>
      <div aria-live="polite">
        {result !== undefined &&
          (result.outcome.ok ? (
            <ReceiptView receipt={result.outcome.value} />
          ) : (
            <div className="notice warn">
              <strong className="noticetitle">Check failed</strong>
              <p>{result.outcome.problem.message}</p>
              <p className="note">
                Requested {result.target.accountId} · {result.target.roleName}. No other account or
                role was tried.
              </p>
            </div>
          ))}
      </div>
    </section>
  );
}
