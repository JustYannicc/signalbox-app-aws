/** AWS Identity Center protocol failure safe to show in logs or a user-facing recovery state. */
export type AwsIdentityFailure =
  | "invalid_start_url"
  | "invalid_region"
  | "wrong_region"
  | "authorization_pending"
  | "slow_down"
  | "authorization_denied"
  | "device_code_expired"
  | "session_expired"
  | "access_denied"
  | "no_access"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "request_failed";

const recovery: Record<AwsIdentityFailure, string> = {
  invalid_start_url: "Use the AWS access portal address ending in /start.",
  invalid_region: "Check the AWS Identity Center region and try again.",
  wrong_region: "Use the region where your AWS access portal is configured.",
  authorization_pending: "Finish signing in through AWS and your company's sign-in page.",
  slow_down: "AWS asked us to wait longer before checking sign-in again.",
  authorization_denied: "Sign-in was denied. Start again if you want to connect AWS.",
  device_code_expired: "The sign-in link expired. Start again to get a new link.",
  session_expired: "Sign in to AWS again to continue.",
  access_denied:
    "AWS did not allow this account or role. Choose an assigned role or ask your administrator about access.",
  no_access: "AWS returned no accounts or roles for this sign-in.",
  rate_limited: "AWS is receiving too many requests. Try again shortly.",
  unavailable: "AWS is temporarily unavailable. Keep this connection and try again shortly.",
  invalid_response:
    "AWS returned a response this connection could not use. Keep the connection and retry.",
  request_failed: "AWS could not complete this request. Keep the connection and retry.",
};

export class AwsIdentityError extends Error {
  readonly name = "AwsIdentityError";
  constructor(
    readonly failure: AwsIdentityFailure,
    readonly retryable: boolean,
  ) {
    super(recovery[failure]);
  }
}

const commercialRegions = new Set([
  "af-south-1",
  "ap-east-1",
  "ap-east-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-southeast-5",
  "ap-southeast-6",
  "ap-southeast-7",
  "ca-central-1",
  "ca-west-1",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "il-central-1",
  "me-central-1",
  "me-south-1",
  "mx-central-1",
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
]);

export const validateStartUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AwsIdentityError("invalid_start_url", false);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+awsapps\.com$/u.test(url.hostname) ||
    url.pathname !== "/start"
  )
    throw new AwsIdentityError("invalid_start_url", false);
  return url;
};

export const validateRegion = (region: string): string => {
  if (!commercialRegions.has(region)) throw new AwsIdentityError("invalid_region", false);
  return region;
};
