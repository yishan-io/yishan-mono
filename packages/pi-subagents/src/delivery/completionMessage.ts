import type { AgentResult } from "../delegation";

const MAX_COMPLETION_LENGTH = 50_000;

/** Model-facing completion only; usage remains solely in the existing lifecycle ledger. */
export function buildCompletionMessage(result: AgentResult): {
  customType: string;
  content: string;
  display: true;
} {
  const reference = `\n\nChild transcript: ${result.sessionPath || "unavailable (child session was not persisted)"}`;
  const notice = "\n[Result truncated]";
  const body = [
    `Sub-agent ${result.agentId} (${result.agentName}): ${result.status}`,
    result.error ? `Error: ${result.error}` : undefined,
    result.cancellationOrigin ? `Cancellation: ${result.cancellationOrigin}` : undefined,
    result.responseText || "(no output)",
  ]
    .filter(Boolean)
    .join("\n\n");
  const available = MAX_COMPLETION_LENGTH - reference.length;
  const content =
    body.length > available
      ? `${body.slice(0, available - notice.length)}${notice}${reference}`
      : `${body}${reference}`;
  return { customType: "subagent-completion", content, display: true };
}
