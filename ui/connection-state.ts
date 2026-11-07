/**
 * One saved connection's inventory and its writes. Writes run one at a time per connection, and a
 * failure keeps the last good inventory and choices on screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AwsApi } from "./api.ts";
import {
  targetLabel,
  type AwsAccount,
  type AwsConnection,
  type Outcome,
  type Problem,
  type Receipt,
  type Target,
} from "./model.ts";

export type Busy =
  | { readonly kind: "refresh" }
  | { readonly kind: "default"; readonly target: Target | null }
  | { readonly kind: "production"; readonly accountId: string; readonly production: boolean }
  | { readonly kind: "check"; readonly target: Target };

/** Where a problem came from decides what "Try again" repeats. */
export interface SourcedProblem {
  readonly source: "load" | "refresh" | "write";
  readonly problem: Problem;
}

export interface ConnectionState {
  readonly loading: boolean;
  readonly value?: AwsConnection | undefined;
  readonly problem?: SourcedProblem | undefined;
  readonly busy?: Busy | undefined;
  readonly notice?: string | undefined;
  readonly check?: { readonly target: Target; readonly outcome: Outcome<Receipt> } | undefined;
}

export function useConnection(api: AwsApi, id: string) {
  const [state, setState] = useState<ConnectionState>({ loading: true });
  const reads = useRef(0);
  const writing = useRef(false);

  const load = useCallback(() => {
    const read = ++reads.current;
    setState((current) => ({ ...current, loading: true }));
    void api.inventory(id).then((outcome) => {
      // A newer read or any write answered after this read started.
      if (read !== reads.current) return;
      setState((current) =>
        outcome.ok
          ? { ...current, loading: false, value: outcome.value, problem: undefined }
          : { ...current, loading: false, problem: { source: "load", problem: outcome.problem } },
      );
    });
  }, [api, id]);

  // Coming back from the Accounts tab, such as after re-sign-in, reads the inventory again.
  useEffect(() => {
    load();
    return api.onActiveChange((active) => {
      if (active && !writing.current) load();
    });
  }, [api, load]);

  const write = (
    busy: Busy,
    run: () => Promise<Outcome<AwsConnection>>,
    done: (value: AwsConnection) => string,
  ) => {
    if (writing.current) return;
    writing.current = true;
    reads.current++;
    setState((current) => ({ ...current, busy, notice: undefined }));
    void run().then((outcome) => {
      writing.current = false;
      setState((current) =>
        outcome.ok
          ? {
              ...current,
              loading: false,
              busy: undefined,
              value: outcome.value,
              problem: undefined,
              notice: done(outcome.value),
            }
          : {
              ...current,
              loading: false,
              busy: undefined,
              problem: {
                source: busy.kind === "refresh" ? "refresh" : "write",
                problem: outcome.problem,
              },
            },
      );
    });
  };

  return {
    state,
    load,
    refresh: () =>
      write(
        { kind: "refresh" },
        () => api.refresh(id),
        (value) =>
          value.accounts.length === 0
            ? "Refreshed. AWS returned no assigned accounts."
            : "Account list refreshed from AWS.",
      ),
    setDefault: (target: Target | null) =>
      write(
        { kind: "default", target },
        () => api.setDefault(id, target),
        (value) =>
          value.defaultTarget === null
            ? "Default cleared. Tasks now name their account and role."
            : `Default saved: ${targetLabel(value, value.defaultTarget)}.`,
      ),
    setProduction: (account: AwsAccount, production: boolean) =>
      write(
        { kind: "production", accountId: account.accountId, production },
        () => api.setProduction(id, account.accountId, production),
        () =>
          production
            ? `${account.accountName} is marked as production.`
            : `${account.accountName} is no longer marked as production.`,
      ),
    check: (target: Target) => {
      if (writing.current) return;
      writing.current = true;
      setState((current) => ({ ...current, busy: { kind: "check", target }, check: undefined }));
      void api.checkAccess(id, target).then((outcome) => {
        writing.current = false;
        setState((current) => ({ ...current, busy: undefined, check: { target, outcome } }));
      });
    },
  };
}

export type ConnectionControls = ReturnType<typeof useConnection>;
