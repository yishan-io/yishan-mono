import type { AgentMessage } from "../store/agentChatTypes";

// ─── Budget constants ─────────────────────────────────────────────────────────

/** Maximum UTF-8 bytes for any single display message (truncation notice included). */
export const PER_MESSAGE_UTF8_BYTES = 65536; // 64 KiB

/** Maximum depth for bounded recursive normalization of details/arguments objects. */
export const MAX_DETAILS_DEPTH = 5;

/** Maximum item count for bounded recursive normalization of details/arguments objects. */
export const MAX_DETAILS_ITEMS = 100;

/** Maximum UTF-8 bytes for any single string within details/arguments. */
export const MAX_DETAILS_STRING_UTF8_BYTES = 4096;

/** Maximum aggregate UTF-8 bytes retained per tab transcript. */
export const MAX_PER_TAB_AGGREGATE_UTF8_BYTES = 8 * 1024 * 1024; // 8 MiB

/** Maximum child subagent transcripts per parent tab. */
export const MAX_SUBAGENT_CHILDREN = 20;

/** Maximum messages retained per child subagent transcript. */
export const MAX_SUBAGENT_MESSAGES_PER_CHILD = 100;

/** Maximum aggregate UTF-8 bytes across all child subagent transcripts per parent tab. */
export const MAX_SUBAGENT_AGGREGATE_UTF8_BYTES = 2 * 1024 * 1024; // 2 MiB

// ─── Byte accounting ──────────────────────────────────────────────────────────

const sharedEncoder = new TextEncoder();

/**
 * Counts the total UTF-8 bytes of all display-visible string content
 * in an AgentMessage. Used for aggregate per-tab byte-budget enforcement.
 */
export function countMessageUtf8Bytes(message: AgentMessage): number {
  let total = 0;

  if (typeof message.content === "string") {
    total += sharedEncoder.encode(message.content).length;
  } else {
    for (const block of message.content) {
      if (block.type === "text") {
        total += sharedEncoder.encode(block.text).length;
      } else if (block.type === "thinking") {
        total += sharedEncoder.encode(block.thinking).length;
        if (typeof block.thinkingSignature === "string") {
          total += sharedEncoder.encode(block.thinkingSignature).length;
        } else if (block.thinkingSignature?.summary) {
          for (const s of block.thinkingSignature.summary) {
            total += sharedEncoder.encode(s.text).length;
          }
        }
      } else if (block.type === "toolCall") {
        total += sharedEncoder.encode(JSON.stringify(block.arguments)).length;
      }
    }
  }

  if (message.errorMessage) total += sharedEncoder.encode(message.errorMessage).length;
  if (message.stopReason) total += sharedEncoder.encode(message.stopReason).length;
  if (message.customType) total += sharedEncoder.encode(message.customType).length;
  if (message.toolName) total += sharedEncoder.encode(message.toolName).length;
  if (message.toolCallId) total += sharedEncoder.encode(message.toolCallId).length;
  if (message.details) total += sharedEncoder.encode(JSON.stringify(message.details)).length;

  return total;
}
