import { MAX_SUBAGENT_MESSAGES_PER_CHILD } from "../chat/agentChatBudget";
import type { AgentMessage } from "../chat/agentChatTypes";
import { removeIncompleteAssociations } from "../chat/transcript/associations";
import type { SubagentLiveTranscript, SubagentSnapshotCoverage } from "../chat/transcript/subagentSnapshots.types";
import { isRecord, normalizeIncomingAgentMessage } from "./agentChatInboundMessage";

/** Selects a safe raw suffix using identity headers before normalizing retained payloads. */
export function parseSubagentSnapshotMessages(
  rawMessages: unknown[],
): Pick<SubagentLiveTranscript, "messages" | "coverage"> {
  const suffixStart = Math.max(0, rawMessages.length - MAX_SUBAGENT_MESSAGES_PER_CHILD);
  // Position tokens never escape selection or replace incoming display IDs.
  const headers: AgentMessage[] = rawMessages.map((raw, index) => {
    const header: AgentMessage = { id: String(index), role: "user", content: "" };
    if (!isRecord(raw)) return header;
    if (raw.role === "assistant" && Array.isArray(raw.content)) {
      header.role = "assistant";
      header.content = raw.content.flatMap((block) =>
        isRecord(block) && block.type === "toolCall" && typeof block.id === "string"
          ? [{ type: "toolCall" as const, id: block.id, name: "", arguments: {} }]
          : [],
      );
    } else if (raw.role === "toolResult" && typeof raw.toolCallId === "string") {
      header.role = "toolResult";
      header.toolCallId = raw.toolCallId;
    }
    return header;
  });
  const selected = removeIncompleteAssociations(headers, suffixStart);
  const reasons: SubagentSnapshotCoverage["reasons"] = [];
  if (suffixStart > 0) reasons.push("messageLimit");
  if (selected.length < rawMessages.length - suffixStart) reasons.push("association");
  const messages = selected.flatMap((header) => {
    const normalized = normalizeIncomingAgentMessage(rawMessages[Number(header.id)]);
    return normalized ? [normalized] : [];
  });
  if (messages.length < selected.length) reasons.push("invalidMessage");
  const omittedMessages = rawMessages.length - messages.length;
  return {
    messages,
    coverage: { completeness: omittedMessages > 0 ? "partial" : "unknown", omittedMessages, reasons },
  };
}
