import type { AgentMessage } from "./agentChatTypes";

/** Validated terminal child record, independent of custom-message prose and usage. */
export type SubagentCompletion = {
  agentId: string;
  agentName: string;
  status: "completed" | "failed" | "cancelled";
  sessionId?: string;
};

/** Projects only explicitly displayed v1 completions; malformed identities never become navigation targets. */
export function projectSubagentCompletion(message: AgentMessage): SubagentCompletion | null {
  if (message.role !== "custom" || message.display !== true || message.customType !== "subagent-completion") {
    return null;
  }
  const details = message.details;
  if (!details || details.version !== 1) return null;
  const { agentId, agentName, status, sessionId } = details;
  if (!isNonEmptyTrimmedString(agentId) || typeof agentName !== "string" || !agentName.trim()) return null;
  if (status !== "completed" && status !== "failed" && status !== "cancelled") return null;
  if (sessionId !== undefined && !isNonEmptyTrimmedString(sessionId)) return null;
  return { agentId, agentName, status, ...(sessionId !== undefined ? { sessionId } : {}) };
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
