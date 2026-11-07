import { Schema } from "effect";
import { AwsIdentityError } from "./errors.ts";

const registeredClientFields = {
  clientId: Schema.NonEmptyString,
  clientSecret: Schema.NonEmptyString,
  clientSecretExpiresAt: Schema.Number,
};
export const RegisteredClientSchema = Schema.Struct(registeredClientFields);
export interface RegisteredClient {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly clientSecretExpiresAt: number;
}
export interface IdentityClientSession extends RegisteredClient {
  readonly region: string;
  readonly startUrl: string;
}
export const DeviceAuthorizationSchema = Schema.Struct({
  deviceCode: Schema.NonEmptyString,
  userCode: Schema.NonEmptyString,
  verificationUri: Schema.NonEmptyString,
  verificationUriComplete: Schema.NonEmptyString,
  expiresAt: Schema.Number,
  intervalSeconds: Schema.Number,
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
  accessToken: Schema.NonEmptyString,
  accessTokenExpiresAt: Schema.Number,
  refreshToken: Schema.optionalKey(Schema.NonEmptyString),
  refreshTokenExpiresAt: Schema.optionalKey(Schema.Number),
};
export const TokenSetSchema = Schema.Struct(tokenSetFields);
export interface TokenSet {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken?: string;
  readonly refreshTokenExpiresAt?: number;
}
export const IdentitySessionSchema = Schema.Struct({
  ...registeredClientFields,
  ...tokenSetFields,
  region: Schema.NonEmptyString,
  startUrl: Schema.NonEmptyString,
});
export interface IdentitySession extends IdentityClientSession, TokenSet {}
export const PendingIdentitySessionSchema = Schema.Struct({
  ...registeredClientFields,
  region: Schema.NonEmptyString,
  startUrl: Schema.NonEmptyString,
  deviceCode: Schema.NonEmptyString,
  userCode: Schema.NonEmptyString,
  verificationUri: Schema.NonEmptyString,
  verificationUriComplete: Schema.NonEmptyString,
  expiresAt: Schema.Number,
  intervalSeconds: Schema.Number,
});
export const AssignedAccountSchema = Schema.Struct({
  accountId: Schema.String.check(Schema.isPattern(/^\d{12}$/u)),
  accountName: Schema.NonEmptyString,
  emailAddress: Schema.optionalKey(Schema.String),
});
export interface AssignedAccount {
  readonly accountId: string;
  readonly accountName: string;
  readonly emailAddress?: string;
}
export const AssignedRoleSchema = Schema.Struct({
  roleName: Schema.NonEmptyString,
  accountId: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\d{12}$/u))),
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
export const Device = Schema.Struct({
  deviceCode: Schema.NonEmptyString,
  userCode: Schema.NonEmptyString,
  verificationUri: Schema.String,
  verificationUriComplete: Schema.String,
  expiresIn: Schema.Number,
  interval: Schema.optionalKey(Schema.Number),
});
export const Token = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  expiresIn: Schema.Number,
  refreshToken: Schema.optionalKey(Schema.NonEmptyString),
  refreshTokenExpiresIn: Schema.optionalKey(Schema.Number),
});
export const AccountsPage = Schema.Struct({
  accountList: Schema.Array(AssignedAccountSchema),
  nextToken: Schema.optionalKey(Schema.String),
});
export const RolesPage = Schema.Struct({
  roleList: Schema.Array(AssignedRoleSchema),
  nextToken: Schema.optionalKey(Schema.String),
});
export const RoleCredentials = Schema.Struct({
  roleCredentials: Schema.Struct({
    accessKeyId: Schema.NonEmptyString,
    secretAccessKey: Schema.NonEmptyString,
    sessionToken: Schema.NonEmptyString,
    expiration: Schema.Number,
  }),
});
export const parse = <A>(schema: Schema.Decoder<A>, value: unknown): A => {
  const result = Schema.decodeUnknownOption(schema)(value);
  if (result._tag === "None") throw new AwsIdentityError("invalid_response", false);
  return result.value;
};
