import { AwsIdentityError } from "./errors.ts";
export class ChoiceRequired extends Error {
  readonly name = "ChoiceRequired";
}
export const safeResult = async <A>(work: () => Promise<A>) => {
  try {
    return { ok: true as const, value: await work() };
  } catch (error) {
    if (error instanceof AwsIdentityError)
      return {
        ok: false as const,
        state: error.failure,
        message: error.message,
        retryable: error.retryable,
      };
    if (error instanceof ChoiceRequired)
      return {
        ok: false as const,
        state: "choice_required",
        message: error.message,
        retryable: false,
      };
    return {
      ok: false as const,
      state: "unavailable",
      message:
        "AWS could not complete this request. Keep your connection and retry. No different account or role was selected.",
      retryable: true,
    };
  }
};
