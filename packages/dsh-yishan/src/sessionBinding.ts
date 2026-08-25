import { requireExactRecord, requireNonEmptyString, requirePositiveSafeInteger } from "./wireValidation";

/** Immutable daemon-authorized workspace binding recorded for one DSH session. */
export type SessionBinding = {
  sessionId: string;
  workspaceId: string;
  workspaceGeneration: number;
  cwd: string;
};

/** Parses the binding payload that must be durable before a session becomes active. */
export function parseSessionBinding(payload: unknown): SessionBinding {
  const binding = requireExactRecord(payload, "session binding", [
    "sessionId",
    "workspaceId",
    "workspaceGeneration",
    "cwd",
  ]);
  return {
    sessionId: requireNonEmptyString(binding, "sessionId"),
    workspaceId: requireNonEmptyString(binding, "workspaceId"),
    workspaceGeneration: requirePositiveSafeInteger(binding, "workspaceGeneration"),
    cwd: requireNonEmptyString(binding, "cwd"),
  };
}
