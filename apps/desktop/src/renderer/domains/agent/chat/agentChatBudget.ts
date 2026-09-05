import type { AgentContentBlock, AgentMessage, AgentThinkingSignature } from "./agentChatTypes";

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
  const contentBytes =
    typeof message.content === "string"
      ? countUtf8Bytes(message.content)
      : message.content.reduce((total, block) => total + countContentBlockUtf8Bytes(block), 0);
  const metadataValues = [
    message.errorMessage,
    message.stopReason,
    message.customType,
    message.toolName,
    message.toolCallId,
    message.details ? JSON.stringify(message.details) : undefined,
  ];

  return contentBytes + metadataValues.reduce((total, value) => total + countUtf8Bytes(value), 0);
}

function countContentBlockUtf8Bytes(block: AgentContentBlock): number {
  switch (block.type) {
    case "text":
      return countUtf8Bytes(block.text);
    case "thinking":
      return countUtf8Bytes(block.thinking) + countThinkingSignatureUtf8Bytes(block.thinkingSignature);
    case "toolCall":
      return countUtf8Bytes(JSON.stringify(block.arguments));
  }
}

function countThinkingSignatureUtf8Bytes(signature: string | AgentThinkingSignature | undefined): number {
  if (typeof signature === "string") return countUtf8Bytes(signature);
  return signature?.summary?.reduce((total, summary) => total + countUtf8Bytes(summary.text), 0) ?? 0;
}

function countUtf8Bytes(value: string | undefined): number {
  return value ? sharedEncoder.encode(value).length : 0;
}
