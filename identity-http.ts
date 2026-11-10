import { AwsIdentityError } from "./errors.ts";

const MAX_BODY_BYTES = 1_000_000;
const safeCode = (value: unknown): string => (typeof value === "string" ? value : "");
const failureFor = (
  status: number,
  code: string,
  action: "start" | "poll" | "refresh" | "accounts" | "roles" | "credentials",
): AwsIdentityError => {
  const normalized = code
    .replace(/Exception$/u, "")
    .replace(/[^A-Za-z]/gu, "")
    .toLowerCase();
  if (["wrongregion", "invalidrequestregion", "regionnotsupported"].includes(normalized))
    return new AwsIdentityError("wrong_region", false);
  if (["authorizationpending", "pendingauthorization"].includes(normalized))
    return new AwsIdentityError("authorization_pending", true);
  if (normalized === "slowdown") return new AwsIdentityError("slow_down", true);
  if (["accessdenied", "authorizationdeclined"].includes(normalized))
    return new AwsIdentityError(
      action === "poll" ? "authorization_denied" : "access_denied",
      false,
    );
  if (["expiredtoken", "authorizationexpired"].includes(normalized))
    return new AwsIdentityError(
      action === "poll" ? "device_code_expired" : "session_expired",
      false,
    );
  if (["unauthorized", "forbidden", "invalidgrant"].includes(normalized))
    return new AwsIdentityError("session_expired", false);
  if (
    ["toomanyrequests", "throttling", "throttlingexception"].includes(normalized) ||
    status === 429
  )
    return new AwsIdentityError("rate_limited", true);
  if (status >= 500) return new AwsIdentityError("unavailable", true);
  return new AwsIdentityError("request_failed", false);
};

/** JSON over the host fetch policy; AWS errors leave through safe recovery states. */
export const identityHttp = (fetcher: typeof globalThis.fetch) => {
  const request = async (
    url: string,
    init: RequestInit,
    action: Parameters<typeof failureFor>[2] = "start",
  ) => {
    let response: Response;
    try {
      response = await fetcher(url, init);
    } catch {
      throw new AwsIdentityError("unavailable", true);
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
      throw new AwsIdentityError("invalid_response", false);
    let value: unknown;
    try {
      // AWS JSON protocols may send null for an unset optional member; decoders expect absence.
      value = text === "" ? {} : JSON.parse(text, (_key, field) => field ?? undefined);
    } catch {
      throw new AwsIdentityError("invalid_response", false);
    }
    if (!response.ok) {
      const record =
        typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
      throw failureFor(
        response.status,
        safeCode(record.error ?? record.code ?? record.__type),
        action,
      );
    }
    return value;
  };
  const post = (
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
    action: Parameters<typeof failureFor>[2] = "start",
  ) =>
    request(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      },
      action,
    );
  const get = (
    url: string,
    headers: Record<string, string> = {},
    action: Parameters<typeof failureFor>[2] = "accounts",
  ) => request(url, { method: "GET", headers }, action);
  return { post, get };
};
