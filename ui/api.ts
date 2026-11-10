/**
 * Calls to this app's own AWS operations through apps/client. Every request uses the native
 * accountRouter envelope {accountId, input}, and every response is schema-validated before use.
 */
import {
  array,
  boolean,
  json,
  number,
  object,
  string,
  type Infer,
  type JsonObject,
  type Schema,
} from "apps";
import { createAppClient, type OperationReference } from "apps/client";
import {
  connectionFrom,
  receiptFrom,
  type AwsConnection,
  type Outcome,
  type Problem,
  type Receipt,
  type Target,
} from "./model.ts";

const client = createAppClient();

const Account = object({
  accountId: string(),
  accountName: string(),
  roles: array(string()),
  production: boolean(),
});
const Connection = object({
  connection: string(),
  startUrl: string(),
  region: string(),
  expiresAt: number(),
  accounts: array(Account),
  // An object or null; model.ts narrows it.
  defaultTarget: json(),
  state: string(),
});
const Check = object({
  target: object({
    connection: string(),
    accountId: string(),
    accountName: string(),
    roleName: string(),
    production: boolean(),
    operation: string(),
    arguments: json(),
  }),
  result: object({ content: array(json()).optional(), isError: boolean().optional() }),
});

/** Every operation answers {ok:true,value} or {ok:false,state,message,retryable}. */
const result = <T>(value: Schema<T, boolean>) =>
  object({
    ok: boolean(),
    value: value.optional(),
    state: string().optional(),
    message: string().optional(),
    retryable: boolean().optional(),
  });
const InventoryResult = result(object({ connections: array(Connection) }));
const ConnectionResult = result(Connection);
const CheckResult = result(Check);

type Routed<Input> = { readonly accountId: string; readonly input: Input };
type NoInput = { readonly [key: string]: never };
const reference = <Input, Output, Kind extends "query" | "mutation">(
  name: string,
  kind: Kind,
): OperationReference<Routed<Input>, Output, Kind> => ({ name, kind });

const inventory = reference<NoInput, Infer<typeof InventoryResult>, "query">("inventory", "query");
const refresh = reference<NoInput, Infer<typeof ConnectionResult>, "mutation">(
  "refresh",
  "mutation",
);
const setDefault = reference<
  { readonly accountId?: string; readonly roleName?: string },
  Infer<typeof ConnectionResult>,
  "mutation"
>("setDefault", "mutation");
const setProduction = reference<
  { readonly accountId: string; readonly production: boolean },
  Infer<typeof ConnectionResult>,
  "mutation"
>("setProduction", "mutation");
const getTasks = reference<
  { readonly account: string; readonly role: string; readonly arguments: JsonObject },
  Infer<typeof CheckResult>,
  "mutation"
>("get_tasks", "mutation");

const invalid: Problem = {
  state: "invalid_response",
  message:
    "AWS returned a response this page couldn't use. Your connection is unchanged. Try again.",
  retryable: true,
};
const unreachable: Problem = {
  state: "transport",
  message:
    "This page couldn't reach your AWS connection. Your saved choices are unchanged. Try again.",
  retryable: true,
};
/** Legacy OAuth connections have no inventory; their read fails before reaching the app. */
const unlisted: Problem = {
  state: "transport",
  message:
    "This connection couldn't be loaded. If it uses the older AWS sign-in, connect AWS Identity Center in Accounts. Your older AWS sign-in stays available. Otherwise, try again.",
  retryable: true,
};

type Wire<T> = {
  readonly ok: boolean;
  readonly value?: T | undefined;
  readonly state?: string | undefined;
  readonly message?: string | undefined;
  readonly retryable?: boolean | undefined;
};
/** ok:true without a usable value is not success. */
const settle = <T, A>(wire: Wire<T>, read: (value: T) => A | undefined): Outcome<A> => {
  if (!wire.ok)
    return {
      ok: false,
      problem: {
        state: wire.state ?? "unavailable",
        message: wire.message ?? unreachable.message,
        retryable: wire.retryable ?? true,
      },
    };
  const value = wire.value === undefined ? undefined : read(wire.value);
  return value === undefined ? { ok: false, problem: invalid } : { ok: true, value };
};
const failed =
  <A>(problem: Problem) =>
  (): Outcome<A> => ({ ok: false, problem });

export const aws = {
  inventory: (id: string): Promise<Outcome<AwsConnection>> =>
    client
      .query(inventory, { accountId: id, input: {} }, InventoryResult)
      .then((wire): Outcome<AwsConnection> =>
        wire.ok && wire.value?.connections.length === 0
          ? { ok: false, problem: unlisted }
          : settle(wire, (value) => {
              const found = value.connections.find((item) => item.connection === id);
              return found === undefined ? undefined : connectionFrom(found);
            }),
      )
      .catch(failed<AwsConnection>(unlisted)),
  /** Revalidates accounts and roles with AWS; keeps the default and production marks. */
  refresh: (id: string): Promise<Outcome<AwsConnection>> =>
    client
      .mutate(refresh, { accountId: id, input: {} }, ConnectionResult)
      .then((wire) => settle(wire, connectionFrom))
      .catch(failed<AwsConnection>(unreachable)),
  /** Null clears the default; a target sets both fields. */
  setDefault: (id: string, target: Target | null): Promise<Outcome<AwsConnection>> =>
    client
      .mutate(
        setDefault,
        {
          accountId: id,
          input: target === null ? {} : { accountId: target.accountId, roleName: target.roleName },
        },
        ConnectionResult,
      )
      .then((wire) => settle(wire, connectionFrom))
      .catch(failed<AwsConnection>(unreachable)),
  setProduction: (
    id: string,
    accountId: string,
    production: boolean,
  ): Promise<Outcome<AwsConnection>> =>
    client
      .mutate(setProduction, { accountId: id, input: { accountId, production } }, ConnectionResult)
      .then((wire) => settle(wire, connectionFrom))
      .catch(failed<AwsConnection>(unreachable)),
  /** One real get_tasks read with an explicit account and role, never the saved default. */
  checkAccess: (id: string, target: Target): Promise<Outcome<Receipt>> =>
    client
      .mutate(
        getTasks,
        {
          accountId: id,
          input: { account: target.accountId, role: target.roleName, arguments: {} },
        },
        CheckResult,
      )
      .then((wire) => settle(wire, receiptFrom))
      .catch(failed<Receipt>(unreachable)),
  /** Fires when the host shows or hides this page, such as returning from the Accounts tab. */
  onActiveChange: client.onActiveChange,
};

export type AwsApi = typeof aws;
