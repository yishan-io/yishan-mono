import {
  MAX_PER_TAB_AGGREGATE_UTF8_BYTES,
  MAX_SUBAGENT_AGGREGATE_UTF8_BYTES,
  MAX_SUBAGENT_CHILDREN,
  MAX_SUBAGENT_MESSAGES_PER_CHILD,
  countMessageUtf8Bytes,
} from "../../../helpers/agentChatBudget";
import type { AgentMessage } from "./agentChatTypes";

/** Maximum messages retained per chat tab transcript. */
export const MAX_MESSAGES_PER_TAB = 1000;

/**
 * Trims session messages to fit within MAX_MESSAGES_PER_TAB and the aggregate
 * UTF-8 byte budget. Keeps newest messages; a single oversized message is
 * retained rather than leaving the transcript empty.
 */
export function trimSessionMessages(messages: AgentMessage[]): AgentMessage[] {
  // 1. Apply count cap (keep newest).
  let trimmed = messages;
  if (trimmed.length > MAX_MESSAGES_PER_TAB) {
    trimmed = trimmed.slice(-MAX_MESSAGES_PER_TAB);
  }

  // 2. Apply aggregate byte budget (keep newest).
  let totalBytes = 0;
  const kept: AgentMessage[] = [];
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const msg = trimmed[i];
    if (!msg) continue;
    const msgBytes = countMessageUtf8Bytes(msg);
    // Always keep at least one message even if it exceeds the budget.
    if (totalBytes + msgBytes <= MAX_PER_TAB_AGGREGATE_UTF8_BYTES || kept.length === 0) {
      kept.unshift(msg);
      totalBytes += msgBytes;
    } else {
      break;
    }
  }
  return kept;
}

/**
 * Trims subagent live transcripts to fit within per-child and aggregate limits.
 * Caps child count, per-child message count, and aggregate bytes across all
 * children. Retains newest children/messages deterministically (sorted by childSessionId).
 */
export function trimSubagentLiveTranscripts(
  transcripts: Record<string, AgentMessage[]>,
): Record<string, AgentMessage[]> {
  const childIds = Object.keys(transcripts).sort();

  // 1. Cap child count (keep last alphabetically = newest in typical ordered IDs).
  const cappedChildIds = childIds.slice(-MAX_SUBAGENT_CHILDREN);

  // 2. Cap per-child message count.
  const perChildCapped: Record<string, AgentMessage[]> = {};
  for (const childId of cappedChildIds) {
    const messages = transcripts[childId];
    if (!messages) continue;
    perChildCapped[childId] = messages.slice(-MAX_SUBAGENT_MESSAGES_PER_CHILD);
  }

  // 3. Apply aggregate byte budget across children (keep newest = last in sorted order).
  let totalBytes = 0;
  const keptChildIds: string[] = [];
  for (let i = cappedChildIds.length - 1; i >= 0; i--) {
    const childId = cappedChildIds[i];
    if (!childId) continue;
    const messages = perChildCapped[childId];
    if (!messages) continue;
    const childBytes = messages.reduce((sum: number, msg: AgentMessage) => sum + countMessageUtf8Bytes(msg), 0);
    // Always keep at least one child even if it exceeds the budget.
    if (totalBytes + childBytes <= MAX_SUBAGENT_AGGREGATE_UTF8_BYTES || keptChildIds.length === 0) {
      keptChildIds.unshift(childId);
      totalBytes += childBytes;
    } else {
      break;
    }
  }

  const result: Record<string, AgentMessage[]> = {};
  for (const childId of keptChildIds) {
    const childMessages = perChildCapped[childId];
    if (childMessages) result[childId] = childMessages;
  }
  return result;
}
