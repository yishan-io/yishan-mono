import { requireExactRecord, requireNonEmptyString } from "./wireValidation";

/** Exact request to interrupt one direct DSH-native subagent. */
export type SubagentInterruptRequest = {
  cwd: string;
  parentSessionId: string;
  childSessionId: string;
};

/** Receipt for an interrupt request accepted by the DSH runtime. */
export type SubagentInterruptResult = {
  parentSessionId: string;
  childSessionId: string;
  interruptRequested: boolean;
};

/** Parses the exact direct-subagent interrupt request. */
export function parseSubagentInterruptRequest(payload: unknown): SubagentInterruptRequest {
  const request = requireExactRecord(payload, "subagent interrupt request", [
    "cwd",
    "parentSessionId",
    "childSessionId",
  ]);
  return {
    cwd: requireNonEmptyString(request, "cwd"),
    parentSessionId: requireNonEmptyString(request, "parentSessionId"),
    childSessionId: requireNonEmptyString(request, "childSessionId"),
  };
}
