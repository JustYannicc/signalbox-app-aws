/** What the page shows, built only from validated responses. Stable AWS IDs identify everything. */

export interface AwsAccount {
  readonly accountId: string;
  readonly accountName: string;
  readonly roles: readonly string[];
  readonly production: boolean;
}
export interface Target {
  readonly accountId: string;
  readonly roleName: string;
}
export interface AwsConnection {
  /** The native saved connection ID every call routes by. */
  readonly id: string;
  readonly startUrl: string;
  readonly region: string;
  readonly expiresAt: number;
  readonly accounts: readonly AwsAccount[];
  readonly defaultTarget: Target | null;
  readonly expired: boolean;
}
/** A failure the app or transport reported. Messages are already safe to show. */
export interface Problem {
  readonly state: string;
  readonly message: string;
  readonly retryable: boolean;
}
export type Outcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly problem: Problem };
/** The exact target and arguments AWS ran a check with, as the app reported them. */
export interface Receipt {
  readonly connection: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly roleName: string;
  readonly production: boolean;
  readonly operation: string;
  readonly arguments: string;
  readonly failed: boolean;
  readonly text: readonly string[];
}

const targetFrom = (value: unknown): Target | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "object" || value === null) return undefined;
  if (!("accountId" in value) || !("roleName" in value)) return undefined;
  const { accountId, roleName } = value;
  return typeof accountId === "string" && typeof roleName === "string"
    ? { accountId, roleName }
    : undefined;
};

/** Undefined when the response doesn't describe a connection this page understands. */
export const connectionFrom = (wire: {
  readonly connection: string;
  readonly startUrl: string;
  readonly region: string;
  readonly expiresAt: number;
  readonly accounts: readonly AwsAccount[];
  readonly defaultTarget: unknown;
  readonly state: string;
}): AwsConnection | undefined => {
  const defaultTarget = targetFrom(wire.defaultTarget);
  if (defaultTarget === undefined) return undefined;
  if (wire.state !== "connected" && wire.state !== "session_expired") return undefined;
  return {
    id: wire.connection,
    startUrl: wire.startUrl,
    region: wire.region,
    expiresAt: wire.expiresAt,
    accounts: wire.accounts,
    defaultTarget,
    expired: wire.state === "session_expired",
  };
};

const textOf = (item: unknown): string[] =>
  typeof item === "object" &&
  item !== null &&
  "type" in item &&
  item.type === "text" &&
  "text" in item &&
  typeof item.text === "string"
    ? [item.text]
    : [];

export const receiptFrom = (wire: {
  readonly target: {
    readonly connection: string;
    readonly accountId: string;
    readonly accountName: string;
    readonly roleName: string;
    readonly production: boolean;
    readonly operation: string;
    readonly arguments: unknown;
  };
  readonly result: {
    readonly content?: readonly unknown[] | undefined;
    readonly isError?: boolean | undefined;
  };
}): Receipt => ({
  connection: wire.target.connection,
  accountId: wire.target.accountId,
  accountName: wire.target.accountName,
  roleName: wire.target.roleName,
  production: wire.target.production,
  operation: wire.target.operation,
  arguments: JSON.stringify(wire.target.arguments),
  failed: wire.result.isError === true,
  text: (wire.result.content ?? []).flatMap(textOf),
});

/** The portal's own subdomain, such as "your-company" for your-company.awsapps.com/start. */
export const portalName = (startUrl: string) => {
  try {
    return new URL(startUrl).hostname.split(".")[0] || startUrl;
  } catch {
    return startUrl;
  }
};

export const accountCount = (count: number) => `${count} ${count === 1 ? "account" : "accounts"}`;

/** "Name · Role" for a saved target, or its IDs when AWS no longer assigns that account. */
export const targetLabel = (connection: AwsConnection, target: Target) => {
  const account = connection.accounts.find((item) => item.accountId === target.accountId);
  if (account === undefined) return `${target.accountId} · ${target.roleName} (no longer assigned)`;
  return account.roles.includes(target.roleName)
    ? `${account.accountName} · ${target.roleName}`
    : `${account.accountName} · ${target.roleName} (role no longer assigned)`;
};
