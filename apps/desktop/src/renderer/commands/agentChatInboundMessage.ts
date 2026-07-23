import { generateId } from "../helpers/generateId";
import type { AgentContentBlock, AgentMessage, AgentThinkingSignature } from "../store/agentChatTypes";
import {
  MAX_DETAILS_DEPTH,
  MAX_DETAILS_ITEMS,
  MAX_DETAILS_STRING_UTF8_BYTES,
  PER_MESSAGE_UTF8_BYTES,
} from "../helpers/agentChatBudget";

// Re-export for callers that import budget constants from this module.
export { MAX_DETAILS_DEPTH, MAX_DETAILS_ITEMS, MAX_DETAILS_STRING_UTF8_BYTES, PER_MESSAGE_UTF8_BYTES } from "../helpers/agentChatBudget";

// ─── UTF-8 helpers ───────────────────────────────────────────────────────────

const UTF8_CONTINUATION_MASK = 0xc0;
const UTF8_CONTINUATION_BYTE = 0x80;

const TRUNCATION_NOTICE = "…[truncated]";

let sharedEncoder: TextEncoder | null = null;
let sharedDecoder: TextDecoder | null = null;

function getSharedEncoder(): TextEncoder {
  if (!sharedEncoder) sharedEncoder = new TextEncoder();
  return sharedEncoder;
}

function getSharedDecoder(): TextDecoder {
  if (!sharedDecoder) sharedDecoder = new TextDecoder();
  return sharedDecoder;
}

/**
 * Counts the UTF-8 byte length of a string.
 * Safe for empty strings and multi-byte characters.
 */
export function countUtf8Bytes(text: string): number {
  return getSharedEncoder().encode(text).length;
}

/**
 * Truncates `text` to fit within `limit` UTF-8 bytes, appending `…[truncated]`
 * when truncation occurs. Walks back to a safe UTF-8 boundary so multi-byte
 * characters are never split. If the limit is smaller than the notice itself,
 * returns just the truncated notice content.
 */
export function truncateUtf8Bytes(text: string, limit: number): string {
  const encoded = getSharedEncoder().encode(text);
  if (encoded.length <= limit) {
    return text;
  }

  const noticeBytes = getSharedEncoder().encode(TRUNCATION_NOTICE).length;
  const maxContentBytes = limit - noticeBytes;

  // If the limit is too small for the notice, return empty string.
  if (maxContentBytes <= 0) {
    return "";
  }

  let cutoff = maxContentBytes;
  // Walk back to avoid splitting a multi-byte UTF-8 sequence.
  // Continuation bytes in UTF-8 have the form 0b10xxxxxx.
  while (cutoff > 0 && ((encoded[cutoff] ?? 0) & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION_BYTE) {
    cutoff--;
  }

  return getSharedDecoder().decode(encoded.slice(0, cutoff)) + TRUNCATION_NOTICE;
}

// ─── Details normalization (bounded) ─────────────────────────────────────────

/**
 * Normalizes and bounds arbitrary structured `details` data.
 * Recursively enforces MAX_DETAILS_DEPTH, MAX_DETAILS_ITEMS,
 * and MAX_DETAILS_STRING_UTF8_BYTES on every string value.
 */
export function normalizeBoundedDetails(details: unknown, depth: number): Record<string, unknown> | undefined {
  if (depth > MAX_DETAILS_DEPTH) {
    return {};
  }

  if (isRecord(details)) {
    const keys = Object.keys(details).slice(0, MAX_DETAILS_ITEMS);
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = details[key];
      if (typeof value === "string") {
        result[key] = truncateUtf8Bytes(value, MAX_DETAILS_STRING_UTF8_BYTES);
      } else if (Array.isArray(value)) {
        result[key] = value
          .slice(0, MAX_DETAILS_ITEMS)
          .map((item) =>
            typeof item === "string"
              ? truncateUtf8Bytes(item, MAX_DETAILS_STRING_UTF8_BYTES)
              : isRecord(item)
                ? normalizeBoundedDetails(item, depth + 1)
                : item,
          );
      } else if (isRecord(value)) {
        result[key] = normalizeBoundedDetails(value, depth + 1);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // Legacy: details serialized as a JSON string.
  if (typeof details !== "string") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(details);
    return isRecord(parsed) ? normalizeBoundedDetails(parsed, depth + 1) : undefined;
  } catch {
    return undefined;
  }
}

// ─── Content normalization ───────────────────────────────────────────────────

function normalizeMessageContent(content: unknown): string | AgentContentBlock[] {
  if (typeof content === "string") {
    return truncateUtf8Bytes(content, PER_MESSAGE_UTF8_BYTES);
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content.flatMap((block) => {
    const normalizedBlock = normalizeContentBlock(block);
    return normalizedBlock ? [normalizedBlock] : [];
  });
}

function normalizeContentBlock(rawBlock: unknown): AgentContentBlock | null {
  if (!isRecord(rawBlock) || typeof rawBlock.type !== "string") {
    return null;
  }

  if (rawBlock.type === "text" && typeof rawBlock.text === "string") {
    return { type: "text", text: truncateUtf8Bytes(rawBlock.text, PER_MESSAGE_UTF8_BYTES) };
  }
  if (rawBlock.type === "thinking" && typeof rawBlock.thinking === "string") {
    const thinkingSignature = normalizeThinkingSignature(rawBlock.thinkingSignature);
    return {
      type: "thinking",
      thinking: truncateUtf8Bytes(rawBlock.thinking, PER_MESSAGE_UTF8_BYTES),
      thinkingSignature,
    };
  }
  if (
    rawBlock.type === "toolCall" &&
    typeof rawBlock.id === "string" &&
    typeof rawBlock.name === "string" &&
    isRecord(rawBlock.arguments)
  ) {
    const boundedArgs = normalizeBoundedDetails(rawBlock.arguments, 0) ?? {};
    return { type: "toolCall", id: rawBlock.id, name: rawBlock.name, arguments: boundedArgs };
  }

  return null;
}

function normalizeThinkingSignature(signature: unknown): string | AgentThinkingSignature | undefined {
  if (typeof signature === "string") {
    return truncateUtf8Bytes(signature, PER_MESSAGE_UTF8_BYTES);
  }
  if (!isRecord(signature)) {
    return undefined;
  }

  const normalizedSignature: AgentThinkingSignature = {};
  if (typeof signature.id === "string") {
    normalizedSignature.id = truncateUtf8Bytes(signature.id, PER_MESSAGE_UTF8_BYTES);
  }
  if (typeof signature.type === "string") {
    normalizedSignature.type = truncateUtf8Bytes(signature.type, PER_MESSAGE_UTF8_BYTES);
  }
  if (Array.isArray(signature.summary)) {
    normalizedSignature.summary = signature.summary.flatMap((summaryItem) => {
      if (!isRecord(summaryItem) || typeof summaryItem.type !== "string" || typeof summaryItem.text !== "string") {
        return [];
      }
      return [
        {
          type: truncateUtf8Bytes(summaryItem.type, PER_MESSAGE_UTF8_BYTES),
          text: truncateUtf8Bytes(summaryItem.text, PER_MESSAGE_UTF8_BYTES),
        },
      ];
    });
  }
  return normalizedSignature;
}

function normalizeMessageUsage(usage: unknown): AgentMessage["usage"] | undefined {
  if (!isRecord(usage) || typeof usage.input !== "number" || typeof usage.output !== "number") {
    return undefined;
  }

  const normalizedUsage: NonNullable<AgentMessage["usage"]> = { input: usage.input, output: usage.output };
  if (typeof usage.cacheRead === "number") normalizedUsage.cacheRead = usage.cacheRead;
  if (typeof usage.cacheWrite === "number") normalizedUsage.cacheWrite = usage.cacheWrite;
  if (typeof usage.reasoning === "number") normalizedUsage.reasoning = usage.reasoning;
  if (typeof usage.total === "number") normalizedUsage.total = usage.total;
  if (typeof usage.totalTokens === "number") normalizedUsage.totalTokens = usage.totalTokens;
  if (isRecord(usage.cost)) {
    const cost: NonNullable<NonNullable<AgentMessage["usage"]>["cost"]> = {};
    if (typeof usage.cost.input === "number") cost.input = usage.cost.input;
    if (typeof usage.cost.output === "number") cost.output = usage.cost.output;
    if (typeof usage.cost.cacheRead === "number") cost.cacheRead = usage.cost.cacheRead;
    if (typeof usage.cost.cacheWrite === "number") cost.cacheWrite = usage.cost.cacheWrite;
    if (typeof usage.cost.total === "number") cost.total = usage.cost.total;
    normalizedUsage.cost = cost;
  }
  return normalizedUsage;
}

// ─── Main normalization entry point ──────────────────────────────────────────

/**
 * Normalizes an incoming raw agent message from any Pi event source.
 * Applies Unicode-safe UTF-8 truncation to all display content and
 * bounds structured details to prevent unbounded renderer state.
 */
export function normalizeIncomingAgentMessage(rawMessage: unknown): AgentMessage | null {
  if (!isRecord(rawMessage) || !isAgentMessageRole(rawMessage.role)) {
    return null;
  }

  const content = normalizeMessageContent(rawMessage.content);
  const message: AgentMessage = {
    id: typeof rawMessage.id === "string" ? rawMessage.id : generateId(),
    role: rawMessage.role,
    content,
  };

  if (typeof rawMessage.customType === "string") message.customType = rawMessage.customType;
  if (typeof rawMessage.display === "boolean") message.display = rawMessage.display;
  if (typeof rawMessage.toolCallId === "string") message.toolCallId = rawMessage.toolCallId;
  if (typeof rawMessage.toolName === "string") message.toolName = rawMessage.toolName;
  if (typeof rawMessage.isError === "boolean") message.isError = rawMessage.isError;
  const details = normalizeBoundedDetails(rawMessage.details, 0);
  if (details) message.details = details;
  const usage = normalizeMessageUsage(rawMessage.usage);
  if (usage) message.usage = usage;
  if (typeof rawMessage.stopReason === "string")
    message.stopReason = truncateUtf8Bytes(rawMessage.stopReason, PER_MESSAGE_UTF8_BYTES);
  if (typeof rawMessage.errorMessage === "string")
    message.errorMessage = truncateUtf8Bytes(rawMessage.errorMessage, PER_MESSAGE_UTF8_BYTES);
  if (typeof rawMessage.timestamp === "number") message.timestamp = rawMessage.timestamp;
  if (typeof rawMessage.startedAtMs === "number") message.startedAtMs = rawMessage.startedAtMs;
  if (typeof rawMessage.durationMs === "number") message.durationMs = rawMessage.durationMs;

  return message;
}

// ─── In-place message content truncation for delta streams ───────────────────

/**
 * Applies per-message UTF-8 truncation to an already-assembled AgentMessage
 * in place. Used to re-budget delta-accumulated content before it enters the
 * store/stream buffer.
 */
export function truncateMessageContent(message: AgentMessage): void {
  if (typeof message.content === "string") {
    message.content = truncateUtf8Bytes(message.content, PER_MESSAGE_UTF8_BYTES);
    return;
  }

  for (const block of message.content) {
    if (block.type === "text") {
      block.text = truncateUtf8Bytes(block.text, PER_MESSAGE_UTF8_BYTES);
    } else if (block.type === "thinking") {
      block.thinking = truncateUtf8Bytes(block.thinking, PER_MESSAGE_UTF8_BYTES);
    }
  }

  if (message.errorMessage) {
    message.errorMessage = truncateUtf8Bytes(message.errorMessage, PER_MESSAGE_UTF8_BYTES);
  }
  if (message.stopReason) {
    message.stopReason = truncateUtf8Bytes(message.stopReason, PER_MESSAGE_UTF8_BYTES);
  }
}

// ─── Type guards ─────────────────────────────────────────────────────────────

function isAgentMessageRole(role: unknown): role is AgentMessage["role"] {
  return role === "user" || role === "assistant" || role === "toolResult" || role === "custom";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
