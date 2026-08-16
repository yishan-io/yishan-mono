/**
 * Emit-side budgets and normalization primitives for the
 * pi-subagents-live-transcripts widget.
 *
 * The desktop receive side already caps child counts, per-child message
 * counts, and aggregate bytes (apps/desktop .../helpers/agentChatBudget.ts),
 * but those limits run AFTER the extension serializes and sends the payload.
 * These budgets run BEFORE JSON.stringify so a growing child transcript can
 * never be serialized at full size in the parent pi process.
 *
 * This module is the bottom layer: it imports nothing from the other
 * live-transcript modules. Message normalization lives in
 * liveTranscriptMessage.ts and the payload builder in liveTranscriptPayload.ts.
 *
 * Values mirror the desktop receive-side budgets where a direct counterpart
 * exists.
 */

/** Widget payload protocol version (desktop requires version === 1). */
export const LIVE_TRANSCRIPT_VERSION = 1;
/** Maximum messages retained per active child. */
export const MAX_LIVE_MESSAGES_PER_CHILD = 100;
/** Maximum UTF-8 bytes for one message's display content (truncation notice included). */
export const MAX_LIVE_PER_MESSAGE_UTF8_BYTES = 64 * 1024; // 64 KiB
/** Maximum aggregate UTF-8 bytes retained per active child. */
export const MAX_LIVE_PER_CHILD_UTF8_BYTES = 256 * 1024; // 256 KiB
/** Maximum aggregate UTF-8 bytes across all active children (content only). */
export const MAX_LIVE_AGGREGATE_UTF8_BYTES = 2 * 1024 * 1024; // 2 MiB
/** Maximum depth for bounded normalization of details/arguments objects. */
export const MAX_LIVE_DETAILS_DEPTH = 5;
/** Maximum item count for bounded normalization of details/arguments objects. */
export const MAX_LIVE_DETAILS_ITEMS = 100;
/** Maximum UTF-8 bytes for any single string within details/arguments. */
export const MAX_LIVE_DETAILS_STRING_UTF8_BYTES = 4096;
/**
 * Maximum total UTF-8 bytes of one bounded details/arguments record (or one
 * thinking-signature summary). Bounds the per-record blob so a single oversized
 * tool result can never push one emitted widget over the aggregate ceiling.
 */
export const MAX_LIVE_DETAILS_UTF8_BYTES = 16 * 1024; // 16 KiB
/**
 * Slack reserved for JSON envelope overhead (keys, agent metadata, escaping)
 * when asserting that an emitted widget string stays below the aggregate
 * ceiling. Content bytes are budgeted against MAX_LIVE_AGGREGATE_UTF8_BYTES;
 * the serialized widget is additionally verified against ceiling + this slack.
 */
export const MAX_LIVE_PAYLOAD_OVERHEAD_BYTES = 64 * 1024; // 64 KiB

export const TRUNCATION_NOTICE = "…[truncated]";

const UTF8_CONTINUATION_MASK = 0xc0;
const UTF8_CONTINUATION_BYTE = 0x80;

let sharedEncoder: TextEncoder | null = null;
let sharedDecoder: TextDecoder | null = null;

function getSharedEncoder(): TextEncoder {
  if (!sharedEncoder) {
    sharedEncoder = new TextEncoder();
  }
  return sharedEncoder;
}

function getSharedDecoder(): TextDecoder {
  if (!sharedDecoder) {
    sharedDecoder = new TextDecoder();
  }
  return sharedDecoder;
}

/** Counts the UTF-8 byte length of a string. */
export function countUtf8Bytes(text: string): number {
  return getSharedEncoder().encode(text).length;
}

/**
 * Truncates `text` to fit within `limit` UTF-8 bytes, appending `…[truncated]`
 * when truncation occurs. Walks back to a safe UTF-8 boundary so multi-byte
 * characters are never split. If the limit is smaller than the notice itself,
 * returns an empty string (matches the desktop-side twin in
 * agentChatInboundMessage.ts).
 */
export function truncateUtf8Bytes(text: string, limit: number): string {
  const encoded = getSharedEncoder().encode(text);
  if (encoded.length <= limit) {
    return text;
  }

  const noticeBytes = getSharedEncoder().encode(TRUNCATION_NOTICE).length;
  const maxContentBytes = limit - noticeBytes;

  if (maxContentBytes <= 0) {
    return "";
  }

  let cutoff = maxContentBytes;
  // Walk back to avoid splitting a multi-byte UTF-8 sequence.
  while (cutoff > 0 && ((encoded[cutoff] ?? 0) & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION_BYTE) {
    cutoff--;
  }

  return getSharedDecoder().decode(encoded.slice(0, cutoff)) + TRUNCATION_NOTICE;
}

/**
 * Bounds arbitrary structured data (tool-call arguments, tool-result details)
 * by depth, item count, and per-string byte budget. Arrays and objects are
 * truncated to MAX_LIVE_DETAILS_ITEMS entries; strings are truncated to
 * MAX_LIVE_DETAILS_STRING_UTF8_BYTES. Returns undefined for non-plain values.
 *
 * Total bytes are not bounded here; apply trimRecordToBytes() afterwards for
 * the per-record total-bytes budget.
 */
export function normalizeBoundedRecord(value: unknown, depth: number): Record<string, unknown> | undefined {
  if (depth > MAX_LIVE_DETAILS_DEPTH || !isRecord(value)) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).slice(0, MAX_LIVE_DETAILS_ITEMS)) {
    const item = value[key];
    if (typeof item === "string") {
      result[key] = truncateUtf8Bytes(item, MAX_LIVE_DETAILS_STRING_UTF8_BYTES);
    } else if (Array.isArray(item)) {
      result[key] = item.slice(0, MAX_LIVE_DETAILS_ITEMS).map((entry) => boundValue(entry, depth + 1));
    } else {
      result[key] = boundValue(item, depth + 1);
    }
  }
  return result;
}

/**
 * Trims a normalized record to a total UTF-8 budget, keeping keys in order
 * while the serialized size fits. A single oversized value is dropped with its
 * key rather than letting it bypass the budget.
 */
export function trimRecordToBytes(record: Record<string, unknown>, budgetBytes: number): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  let totalBytes = 0;

  for (const [key, value] of Object.entries(record)) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      continue;
    }
    // Key name, colon, and either a comma or the closing brace.
    const cost = countUtf8Bytes(serialized) + countUtf8Bytes(key) + 2;
    if (totalBytes + cost > budgetBytes) {
      continue;
    }
    kept[key] = value;
    totalBytes += cost;
  }

  return kept;
}

function boundValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return truncateUtf8Bytes(value, MAX_LIVE_DETAILS_STRING_UTF8_BYTES);
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_LIVE_DETAILS_ITEMS).map((entry) => boundValue(entry, depth));
  }
  if (isRecord(value)) {
    return normalizeBoundedRecord(value, depth);
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
