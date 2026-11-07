import { object, string, number, array, type Schema } from "apps";
import { AwsIdentityError } from "./errors.ts";

const registeredClientFields = {
  clientId: string({ minLength: 1 }),
  clientSecret: string({ minLength: 1 }),
  clientSecretExpiresAt: number(),
};
export const RegisteredClientSchema = object(registeredClientFields);
export interface RegisteredClient {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly clientSecretExpiresAt: number;
}
export interface IdentityClientSession extends RegisteredClient {
  readonly region: string;
  readonly startUrl: string;
}
export const DeviceAuthorizationSchema = object({
  deviceCode: string({ minLength: 1 }),
  userCode: string({ minLength: 1 }),
  verificationUri: string({ minLength: 1 }),
  verificationUriComplete: string({ minLength: 1 }),
  expiresAt: number(),
  intervalSeconds: number(),
});
export interface DeviceAuthorization {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly expiresAt: number;
  readonly intervalSeconds: number;
}
export interface PendingIdentitySession extends IdentityClientSession, DeviceAuthorization {}
const tokenSetFields = {
  accessToken: string({ minLength: 1 }),
  accessTokenExpiresAt: number(),
  refreshToken: string({ minLength: 1 }).optional(),
  refreshTokenExpiresAt: number().optional(),
};
export const TokenSetSchema = object(tokenSetFields);
export interface TokenSet {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken?: string | undefined;
  readonly refreshTokenExpiresAt?: number | undefined;
}
export const IdentitySessionSchema = object({
  ...registeredClientFields,
  ...tokenSetFields,
  region: string({ minLength: 1 }),
  startUrl: string({ minLength: 1 }),
});
export interface IdentitySession extends IdentityClientSession, TokenSet {}
export const PendingIdentitySessionSchema = object({
  ...registeredClientFields,
  region: string({ minLength: 1 }),
  startUrl: string({ minLength: 1 }),
  deviceCode: string({ minLength: 1 }),
  userCode: string({ minLength: 1 }),
  verificationUri: string({ minLength: 1 }),
  verificationUriComplete: string({ minLength: 1 }),
  expiresAt: number(),
  intervalSeconds: number(),
});
export const AssignedAccountSchema = object({
  accountId: string(),
  accountName: string({ minLength: 1 }),
  emailAddress: string().optional(),
});
export interface AssignedAccount {
  readonly accountId: string;
  readonly accountName: string;
  readonly emailAddress?: string | undefined;
}
export const AssignedRoleSchema = object({
  roleName: string({ minLength: 1 }),
  accountId: string().optional(),
});
export interface AssignedRole {
  readonly roleName: string;
  readonly accountId: string;
}
export interface TemporaryRoleCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string;
  readonly expiresAt: number;
}

export const Registered = RegisteredClientSchema;
export const Device = object({
  deviceCode: string({ minLength: 1 }),
  userCode: string({ minLength: 1 }),
  verificationUri: string(),
  verificationUriComplete: string(),
  expiresIn: number(),
  interval: number().optional(),
});
export const Token = object({
  accessToken: string({ minLength: 1 }),
  expiresIn: number(),
  refreshToken: string({ minLength: 1 }).optional(),
  refreshTokenExpiresIn: number().optional(),
});
export const AccountsPage = object({
  accountList: array(AssignedAccountSchema),
  nextToken: string().optional(),
});
export const RolesPage = object({
  roleList: array(AssignedRoleSchema),
  nextToken: string().optional(),
});
export const RoleCredentials = object({
  roleCredentials: object({
    accessKeyId: string({ minLength: 1 }),
    secretAccessKey: string({ minLength: 1 }),
    sessionToken: string({ minLength: 1 }),
    expiration: number(),
  }),
});
export const parse = <A>(schema: Schema<A>, value: unknown): A => {
  try {
    return schema.parse(value);
  } catch {
    throw new AwsIdentityError("invalid_response", false);
  }
};
