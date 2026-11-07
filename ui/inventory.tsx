import { useId, useState } from "react";
import type { Busy } from "./connection-state.ts";
import { targetLabel, type AwsAccount, type AwsConnection, type Target } from "./model.ts";

function AccountRow({
  account,
  defaultTarget,
  busy,
  onSetDefault,
}: {
  account: AwsAccount;
  defaultTarget: Target | null;
  busy: Busy | undefined;
  onSetDefault: (target: Target) => void;
}) {
  const saved = defaultTarget?.accountId === account.accountId ? defaultTarget.roleName : undefined;
  const fallback =
    saved !== undefined && account.roles.includes(saved) ? saved : (account.roles[0] ?? "");
  const [choice, setChoice] = useState(fallback);
  // A refresh can remove the chosen role; fall back instead of offering a role AWS no longer assigns.
  const role = account.roles.includes(choice) ? choice : fallback;
  const saving = busy?.kind === "default" && busy.target?.accountId === account.accountId;
  return (
    <li className="account">
      <div className="min0">
        <strong>{account.accountName}</strong>{" "}
        {account.production && <span className="badge">Production</span>}
        <small className="id">{account.accountId}</small>
      </div>
      {account.roles.length > 1 ? (
        <select
          aria-label={`Role for ${account.accountName}`}
          value={role}
          onChange={(event) => setChoice(event.target.value)}
        >
          {account.roles.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <span className="role">{account.roles[0] ?? "No assigned role"}</span>
      )}
      {saved !== undefined && saved === role ? (
        <span className="defaultmark">Default</span>
      ) : (
        <button
          type="button"
          className="quiet"
          aria-label={`Set default: ${account.accountName} · ${role}`}
          disabled={busy !== undefined || role === ""}
          onClick={() => onSetDefault({ accountId: account.accountId, roleName: role })}
        >
          {saving ? "Saving…" : "Set default"}
        </button>
      )}
    </li>
  );
}

/** The label is exactly "Treat <name> as production"; the stable ID describes it. */
function ProductionMark({
  account,
  busy,
  onChange,
}: {
  account: AwsAccount;
  busy: Busy | undefined;
  onChange: (account: AwsAccount, production: boolean) => void;
}) {
  const id = useId();
  const pending =
    busy?.kind === "production" && busy.accountId === account.accountId ? busy : undefined;
  return (
    <div className="production">
      <input
        id={`${id}-mark`}
        type="checkbox"
        aria-describedby={`${id}-id`}
        checked={pending === undefined ? account.production : pending.production}
        disabled={busy !== undefined}
        onChange={(event) => onChange(account, event.target.checked)}
      />
      <div className="min0">
        <label htmlFor={`${id}-mark`}>Treat {account.accountName} as production</label>
        <small id={`${id}-id`}>
          {account.accountId}
          {pending !== undefined && " · Saving…"}
        </small>
      </div>
    </div>
  );
}

/** The real account and role inventory, the optional default and the production marks. */
export function Inventory({
  connection,
  busy,
  onSetDefault,
  onSetProduction,
}: {
  connection: AwsConnection;
  busy: Busy | undefined;
  onSetDefault: (target: Target | null) => void;
  onSetProduction: (account: AwsAccount, production: boolean) => void;
}) {
  const target = connection.defaultTarget;
  const clearing = busy?.kind === "default" && busy.target === null;
  return (
    <>
      <ul className="accounts" aria-label="AWS accounts">
        {connection.accounts.map((account) => (
          <AccountRow
            key={account.accountId}
            account={account}
            defaultTarget={target}
            busy={busy}
            onSetDefault={onSetDefault}
          />
        ))}
      </ul>
      <div className="row note">
        <span>
          {target === null
            ? "No default. Each task names its account and role."
            : `Default: ${targetLabel(connection, target)}`}
        </span>
        {target !== null && (
          <button
            type="button"
            className="linkbutton"
            disabled={busy !== undefined}
            onClick={() => onSetDefault(null)}
          >
            {clearing ? "Clearing…" : "Clear default"}
          </button>
        )}
      </div>
      <details className="help">
        <summary>Production protection</summary>
        <p>
          Approval requests show whether an account is production. Scripts and presigned URLs always
          ask for your approval of the exact account, role and arguments before they run, on any
          account.
        </p>
        <p>
          Saved by AWS account ID, so renaming an account in AWS keeps this choice. New accounts
          whose name includes the word “prod” or “production” start marked.
        </p>
        {connection.accounts.map((account) => (
          <ProductionMark
            key={account.accountId}
            account={account}
            busy={busy}
            onChange={onSetProduction}
          />
        ))}
      </details>
    </>
  );
}
