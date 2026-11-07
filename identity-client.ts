import { AwsIdentityError, validateRegion, validateStartUrl } from "./errors.ts";
export { AwsIdentityError } from "./errors.ts";
export type { AwsIdentityFailure } from "./errors.ts";

import {
  Registered,
  Device,
  Token,
  AccountsPage,
  RolesPage,
  RoleCredentials,
  parse,
  type RegisteredClient,
  type IdentityClientSession,
  type DeviceAuthorization,
  type IdentitySession,
  type AssignedAccount,
  type AssignedRole,
  type TemporaryRoleCredentials,
} from "./identity-schema.ts";
export {
  RegisteredClientSchema,
  DeviceAuthorizationSchema,
  TokenSetSchema,
  IdentitySessionSchema,
  PendingIdentitySessionSchema,
} from "./identity-schema.ts";
export type {
  RegisteredClient,
  IdentityClientSession,
  DeviceAuthorization,
  PendingIdentitySession,
  TokenSet,
  IdentitySession,
  AssignedAccount,
  AssignedRole,
  TemporaryRoleCredentials,
} from "./identity-schema.ts";
import { identityHttp } from "./identity-http.ts";

type WireEndpoints = { readonly oidc: string; readonly portal: string };
type ClientOptions = {
  readonly fetch: typeof globalThis.fetch;
  /** Test fixture override only. Production callers derive these from the validated region. */
  readonly endpoints?: WireEndpoints | undefined;
  readonly now?: () => number;
};
const MAX_PAGES = 100;
/** Stateless AWS Identity Center API client. Persist its session only in private server storage. */
export const makeIdentityCenter = (
  input: { readonly region: string; readonly startUrl: string } & ClientOptions,
) => {
  const region = validateRegion(input.region);
  const startUrl = validateStartUrl(input.startUrl).href;
  const endpoints = input.endpoints ?? {
    oidc: `https://oidc.${region}.amazonaws.com`,
    portal: `https://portal.sso.${region}.amazonaws.com`,
  };
  const now = input.now ?? Date.now;
  const { post, get } = identityHttp(input.fetch);
  const oidc = (path: string) => `${endpoints.oidc.replace(/\/$/u, "")}${path}`;
  const portal = (path: string) => `${endpoints.portal.replace(/\/$/u, "")}${path}`;

  const register = async (): Promise<RegisteredClient> =>
    parse(
      Registered,
      await post(oidc("/client/register"), {
        clientName: "Basalt AWS connection",
        clientType: "public",
        grantTypes: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
        scopes: ["sso:account:access"],
      }),
    );

  const begin = async (): Promise<{
    readonly client: IdentityClientSession;
    readonly device: DeviceAuthorization;
  }> => {
    const registered = await register();
    const client: IdentityClientSession = { ...registered, region, startUrl };
    const raw = parse(
      Device,
      await post(oidc("/device_authorization"), {
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        startUrl,
      }),
    );
    let complete: URL;
    let verification: URL;
    try {
      complete = new URL(raw.verificationUriComplete);
      verification = new URL(raw.verificationUri);
    } catch {
      throw new AwsIdentityError("invalid_response", false);
    }
    const deviceHost = `device.sso.${region}.amazonaws.com`;
    if (
      [complete, verification].some(
        (url) =>
          url.protocol !== "https:" ||
          url.hostname !== deviceHost ||
          url.username !== "" ||
          url.password !== "" ||
          url.port !== "",
      )
    )
      throw new AwsIdentityError("invalid_response", false);
    return {
      client,
      device: {
        deviceCode: raw.deviceCode,
        userCode: raw.userCode,
        verificationUri: raw.verificationUri,
        verificationUriComplete: complete.href,
        expiresAt: now() + raw.expiresIn * 1_000,
        intervalSeconds: Math.max(1, raw.interval ?? 5),
      },
    };
  };

  /** One interval-respecting device poll. Caller schedules the next check from retryAfterSeconds. */
  const poll = async (
    session: IdentityClientSession,
    deviceCode: string,
    intervalSeconds: number,
    deviceExpiresAt: number,
  ): Promise<
    | { readonly state: "pending"; readonly retryAfterSeconds: number }
    | { readonly state: "authorized"; readonly session: IdentitySession }
  > => {
    if (now() >= deviceExpiresAt) throw new AwsIdentityError("device_code_expired", false);
    try {
      const token = parse(
        Token,
        await post(
          oidc("/token"),
          {
            clientId: session.clientId,
            clientSecret: session.clientSecret,
            grantType: "urn:ietf:params:oauth:grant-type:device_code",
            deviceCode,
          },
          {},
          "poll",
        ),
      );
      return {
        state: "authorized",
        session: {
          ...session,
          ...token,
          accessTokenExpiresAt: now() + token.expiresIn * 1_000,
          ...(token.refreshTokenExpiresIn === undefined
            ? {}
            : { refreshTokenExpiresAt: now() + token.refreshTokenExpiresIn * 1_000 }),
        },
      };
    } catch (error) {
      if (!(error instanceof AwsIdentityError)) throw error;
      if (error.failure === "authorization_pending")
        return { state: "pending", retryAfterSeconds: intervalSeconds };
      if (error.failure === "slow_down")
        return { state: "pending", retryAfterSeconds: intervalSeconds + 5 };
      throw error;
    }
  };

  const refresh = async (session: IdentitySession): Promise<IdentitySession> => {
    if (
      session.refreshToken === undefined ||
      (session.refreshTokenExpiresAt !== undefined && now() >= session.refreshTokenExpiresAt)
    )
      throw new AwsIdentityError("session_expired", false);
    const token = parse(
      Token,
      await post(
        oidc("/token"),
        {
          clientId: session.clientId,
          clientSecret: session.clientSecret,
          grantType: "refresh_token",
          refreshToken: session.refreshToken,
        },
        {},
        "refresh",
      ),
    );
    return {
      ...session,
      ...token,
      refreshToken: token.refreshToken ?? session.refreshToken,
      accessTokenExpiresAt: now() + token.expiresIn * 1_000,
      ...(token.refreshTokenExpiresIn === undefined
        ? {}
        : { refreshTokenExpiresAt: now() + token.refreshTokenExpiresIn * 1_000 }),
    };
  };

  const bearerHeaders = (session: IdentitySession) => ({
    "x-amz-sso_bearer_token": session.accessToken,
  });
  const pageThrough = async <A>(
    path: string,
    base: Record<string, string>,
    decode: (value: unknown) => {
      readonly rows: readonly A[];
      readonly nextToken?: string | undefined;
    },
    session: IdentitySession,
  ): Promise<A[]> => {
    const values: A[] = [],
      seen = new Set<string>();
    let nextToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({
        ...base,
        max_result: "100",
        ...(nextToken === undefined ? {} : { next_token: nextToken }),
      });
      const result = decode(
        await get(`${portal(path)}?${query}`, bearerHeaders(session), "accounts"),
      );
      values.push(...result.rows);
      nextToken = result.nextToken;
      if (nextToken === undefined || nextToken === "") return values;
      if (seen.has(nextToken)) throw new AwsIdentityError("invalid_response", false);
      seen.add(nextToken);
    }
    throw new AwsIdentityError("invalid_response", false);
  };

  const listAccounts = async (session: IdentitySession): Promise<readonly AssignedAccount[]> => {
    const accounts = await pageThrough(
      "/assignment/accounts",
      {},
      (value) => {
        const page = parse(AccountsPage, value);
        return { rows: page.accountList, nextToken: page.nextToken };
      },
      session,
    );
    if (accounts.length === 0) throw new AwsIdentityError("no_access", false);
    return accounts;
  };
  const listRoles = async (
    session: IdentitySession,
    accountId: string,
  ): Promise<readonly AssignedRole[]> => {
    if (!/^\d{12}$/u.test(accountId)) throw new AwsIdentityError("access_denied", false);
    const roles = await pageThrough(
      "/assignment/roles",
      { account_id: accountId },
      (value) => {
        const page = parse(RolesPage, value);
        return { rows: page.roleList, nextToken: page.nextToken };
      },
      session,
    );
    if (roles.some((role) => role.accountId !== undefined && role.accountId !== accountId))
      throw new AwsIdentityError("invalid_response", false);
    return roles.map((role) => ({ ...role, accountId }));
  };
  const getRoleCredentials = async (
    session: IdentitySession,
    accountId: string,
    roleName: string,
  ): Promise<TemporaryRoleCredentials> => {
    if (!/^\d{12}$/u.test(accountId) || roleName.length < 1 || roleName.length > 128)
      throw new AwsIdentityError("access_denied", false);
    const query = new URLSearchParams({ account_id: accountId, role_name: roleName });
    const raw = parse(
      RoleCredentials,
      await get(
        `${portal("/federation/credentials")}?${query}`,
        bearerHeaders(session),
        "credentials",
      ),
    );
    if (raw.roleCredentials.expiration <= now())
      throw new AwsIdentityError("session_expired", true);
    return { ...raw.roleCredentials, expiresAt: raw.roleCredentials.expiration };
  };

  return { region, startUrl, begin, poll, refresh, listAccounts, listRoles, getRoleCredentials };
};
