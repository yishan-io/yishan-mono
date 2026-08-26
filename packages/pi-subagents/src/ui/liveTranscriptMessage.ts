import type { AgentMessage } from "@earendil-works/pi-agent-core";

import {
  MAX_LIVE_DETAILS_ITEMS,
  MAX_LIVE_DETAILS_UTF8_BYTES,
  MAX_LIVE_MESSAGES_PER_CHILD,
  MAX_LIVE_PER_MESSAGE_UTF8_BYTES,
  countUtf8Bytes,
  normalizeBoundedRecord,
  trimRecordToBytes,
  truncateUtf8Bytes,
} from "./liveTranscriptBudget";

/**
 * Emit-side message normalization for the pi-subagents-live-transcripts widget.
 *
 * Raw child-session messages are copied into a bounded shape that preserves
 * every field the desktop normalizer reads (normalizeIncomingAgentMessage):
 * role/content/customType/display/toolCallId/toolName/isError/details/usage/
 * stopReason/errorMessage/timestamp/startedAtMs/durationMs plus bounded
 * thinking signatures including their summary. Message-level metadata the
 * desktop parser ignores (api/provider/model/responseId/diagnostics) is
 * dropped. Session messages are never mutated.
 */

export interface LiveTranscriptThinkingSignature {
  id?: string;
  type?: string;
  summary?: { type: string; text: string }[];
}

/** Bounded copy of a message's token-usage record (numbers only). */
export interface LiveTranscriptUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  totalTokens?: number;
  total?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
}

export type LiveTranscriptContentBlock =
  | { type: "text"; text: string }
  | {
      type: "thinking";
      thinking: string;
      thinkingSignature?: string | LiveTranscriptThinkingSignature;
    }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };

export interface LiveTranscriptMessage {
  role: "user" | "assistant" | "toolResult" | "custom";
  content: string | LiveTranscriptContentBlock[];
  customType?: string;
  display?: boolean;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: Record<string, unknown>;
  usage?: LiveTranscriptUsage;
  stopReason?: string;
  errorMessage?: string;
  timestamp?: number;
  startedAtMs?: number;
  durationMs?: number;
}

/**
 * Counts the exact UTF-8 bytes serialized for one normalized live message.
 * This includes every emitted field, JSON key, delimiter, and escaping so a
 * tool-call ID or name cannot bypass the child or aggregate byte budgets.
 */
export function countLiveMessageUtf8Bytes(message: LiveTranscriptMessage): number {
  return countUtf8Bytes(JSON.stringify(message));
}

/**
 * Normalizes raw session messages to the bounded emit shape.
 * Returns the normalized messages and the number of truncated strings.
 */
export function normalizeLiveMessages(messages: readonly AgentMessage[]): {
  messages: LiveTranscriptMessage[];
  truncated: number;
} {
  const selectedMessages = selectMessagesWithinCountBudget(messages);
  const truncationCounter = { truncated: 0 };
  const result: LiveTranscriptMessage[] = [];
  const droppedToolCallIds = new Set<string>();
  for (const raw of selectedMessages) {
    const message = normalizeLiveMessage(raw, truncationCounter);
    if (!message) {
      continue;
    }
    if (message.role === "assistant") {
      collectDroppedToolCallIds(raw, message, droppedToolCallIds);
    }
    result.push(message);
  }
  return {
    messages: result.filter(
      (message) => message.role !== "toolResult" || !message.toolCallId || !droppedToolCallIds.has(message.toolCallId),
    ),
    truncated: truncationCounter.truncated,
  };
}
/**
 * Selects the newest messages within the count budget without separating a
 * tool result from the assistant message that issued its call.
 */
function selectMessagesWithinCountBudget(messages: readonly AgentMessage[]): AgentMessage[] {
  if (messages.length <= MAX_LIVE_MESSAGES_PER_CHILD) {
    return [...messages];
  }
  const associationGroups = buildRawToolAssociationGroups(messages);
  const keptIndexes = new Set<number>();
  const processedIndexes = new Set<number>();
  for (let index = messages.length - 1; index >= 0; index--) {
    if (processedIndexes.has(index)) {
      continue;
    }
    const group = associationGroups.get(index) ?? [index];
    if (keptIndexes.size + group.length > MAX_LIVE_MESSAGES_PER_CHILD) {
      for (const groupIndex of group) {
        processedIndexes.add(groupIndex);
      }
      if (group.length === 1) {
        break;
      }
      continue;
    }
    for (const groupIndex of group) {
      keptIndexes.add(groupIndex);
      processedIndexes.add(groupIndex);
    }
  }
  return messages.filter((_, index) => keptIndexes.has(index));
}
/** Groups each raw tool-call assistant message with its emitted tool results. */
function buildRawToolAssociationGroups(messages: readonly AgentMessage[]): Map<number, number[]> {
  const assistantIndexByCallId = new Map<string, number>();
  const resultIndexesByAssistant = new Map<number, number[]>();
  for (const [index, raw] of messages.entries()) {
    if (!isRecord(raw)) {
      continue;
    }
    if (raw.role === "assistant" && Array.isArray(raw.content)) {
      for (const block of raw.content) {
        if (isRecord(block) && block.type === "toolCall" && typeof block.id === "string") {
          assistantIndexByCallId.set(block.id, index);
        }
      }
      continue;
    }
    if (raw.role === "toolResult" && typeof raw.toolCallId === "string") {
      const assistantIndex = assistantIndexByCallId.get(raw.toolCallId);
      if (assistantIndex !== undefined) {
        const resultIndexes = resultIndexesByAssistant.get(assistantIndex) ?? [];
        resultIndexes.push(index);
        resultIndexesByAssistant.set(assistantIndex, resultIndexes);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (const [assistantIndex, resultIndexes] of resultIndexesByAssistant) {
    const group = [assistantIndex, ...resultIndexes];
    for (const index of group) {
      groups.set(index, group);
    }
  }
  return groups;
}
function normalizeLiveMessage(raw: AgentMessage, counter: { truncated: number }): LiveTranscriptMessage | undefined {
  if (!isRecord(raw) || typeof raw.role !== "string") {
    return undefined;
  }
  const truncate = (text: string): string => {
    const bounded = truncateUtf8Bytes(text, MAX_LIVE_PER_MESSAGE_UTF8_BYTES);
    if (bounded !== text) {
      counter.truncated += 1;
    }
    return bounded;
  };
  const maybeString = (value: unknown): string | undefined => (typeof value === "string" ? truncate(value) : undefined);
  const maybeNumber = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
  /** Copies timestamp/elapsed fields the desktop transcript renderer reads. */
  const setNumericTimingFields = (message: LiveTranscriptMessage, raw: Record<string, unknown>): void => {
    const timestamp = maybeNumber(raw.timestamp);
    if (timestamp !== undefined) {
      message.timestamp = timestamp;
    }
    const startedAtMs = maybeNumber(raw.startedAtMs);
    if (startedAtMs !== undefined) {
      message.startedAtMs = startedAtMs;
    }
    const durationMs = maybeNumber(raw.durationMs);
    if (durationMs !== undefined) {
      message.durationMs = durationMs;
    }
  };
  if (raw.role === "assistant") {
    const content = normalizeAssistantContent(raw.content, truncate);
    if (content === undefined) {
      return undefined;
    }
    const message: LiveTranscriptMessage = { role: "assistant", content };
    const stopReason = maybeString(raw.stopReason);
    if (stopReason !== undefined) {
      message.stopReason = stopReason;
    }
    const errorMessage = maybeString(raw.errorMessage);
    if (errorMessage !== undefined) {
      message.errorMessage = errorMessage;
    }
    const usage = normalizeUsage(raw.usage);
    if (usage !== undefined) {
      message.usage = usage;
    }
    setNumericTimingFields(message, raw);
    message.content = trimAssistantContentToByteBudget(message, counter);
    return message;
  }
  if (raw.role === "user") {
    const content = normalizeUserContent(raw.content, truncate);
    if (content === undefined) {
      return undefined;
    }
    const message: LiveTranscriptMessage = { role: "user", content };
    setNumericTimingFields(message, raw);
    return message;
  }
  if (raw.role === "toolResult") {
    const content = normalizeToolResultContent(raw.content, truncate);
    if (content === undefined) {
      return undefined;
    }
    const message: LiveTranscriptMessage = { role: "toolResult", content };
    if (typeof raw.isError === "boolean") {
      message.isError = raw.isError;
    }
    const toolCallId = maybeString(raw.toolCallId);
    if (toolCallId !== undefined) {
      message.toolCallId = toolCallId;
    }
    const toolName = maybeString(raw.toolName);
    if (toolName !== undefined) {
      message.toolName = toolName;
    }
    const details = boundedDetails(raw.details);
    if (details !== undefined) {
      message.details = details;
    }
    setNumericTimingFields(message, raw);
    return message;
  }
  // Custom messages (unknown app shapes): keep only the fields the desktop
  // renders, bounded to the per-message budget. Anything not serializable is
  // dropped entirely — display-only metadata is never worth an unbounded emit.
  if (typeof raw.customType === "string" || typeof raw.display === "boolean") {
    const message: LiveTranscriptMessage = {
      role: "custom",
      content: normalizeUserContent(raw.content, truncate) ?? "",
    };
    const customType = maybeString(raw.customType);
    if (customType !== undefined) {
      message.customType = customType;
    }
    if (typeof raw.display === "boolean") {
      message.display = raw.display;
    }
    setNumericTimingFields(message, raw);
    return message;
  }
  return undefined;
}
/** Bounds a details/arguments record by shape and by total bytes; omits when empty. */
function boundedDetails(value: unknown): Record<string, unknown> | undefined {
  const normalized = normalizeBoundedRecord(value, 0);
  if (normalized === undefined) {
    return undefined;
  }
  const trimmed = trimRecordToBytes(normalized, MAX_LIVE_DETAILS_UTF8_BYTES);
  return Object.keys(trimmed).length > 0 ? trimmed : undefined;
}
function normalizeUserContent(
  content: unknown,
  truncate: (text: string) => string,
): string | LiveTranscriptContentBlock[] | undefined {
  if (typeof content === "string") {
    return truncate(content);
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content.flatMap((block): LiveTranscriptContentBlock[] => {
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") {
      return [];
    }
    return [{ type: "text", text: truncate(block.text) }];
  });
}
/** Removes tool results whose calls were omitted from a byte-capped assistant message. */
function collectDroppedToolCallIds(
  raw: AgentMessage,
  message: LiveTranscriptMessage,
  droppedToolCallIds: Set<string>,
): void {
  if (!isRecord(raw) || !Array.isArray(raw.content) || !Array.isArray(message.content)) {
    return;
  }
  const emittedToolCallIds = new Set(
    message.content.filter((block) => block.type === "toolCall").map((block) => block.id),
  );
  for (const block of raw.content) {
    if (isRecord(block) && block.type === "toolCall" && typeof block.id === "string") {
      const normalizedId = truncateUtf8Bytes(block.id, MAX_LIVE_PER_MESSAGE_UTF8_BYTES);
      if (!emittedToolCallIds.has(normalizedId)) {
        droppedToolCallIds.add(normalizedId);
      }
    }
  }
}
/** Keeps assistant content in order while enforcing the complete message byte budget. */
function trimAssistantContentToByteBudget(
  message: LiveTranscriptMessage,
  counter: { truncated: number },
): LiveTranscriptContentBlock[] {
  if (!Array.isArray(message.content)) {
    return [];
  }
  const kept: LiveTranscriptContentBlock[] = [];
  for (const block of message.content) {
    const candidate = [...kept, block];
    if (countLiveMessageUtf8Bytes({ ...message, content: candidate }) <= MAX_LIVE_PER_MESSAGE_UTF8_BYTES) {
      kept.push(block);
      continue;
    }
    if (block.type === "text") {
      const truncatedText = truncateAssistantTextToFit(message, kept, block.text);
      if (truncatedText !== undefined) {
        kept.push({ type: "text", text: truncatedText });
        counter.truncated += 1;
      }
    }
  }
  return kept;
}
/** Truncates one text block to the remaining serialized-message byte budget. */
function truncateAssistantTextToFit(
  message: LiveTranscriptMessage,
  kept: readonly LiveTranscriptContentBlock[],
  text: string,
): string | undefined {
  let minimum = 0;
  let maximum = countUtf8Bytes(text);
  let bounded: string | undefined;

  while (minimum <= maximum) {
    const limit = Math.floor((minimum + maximum) / 2);
    const candidate = truncateUtf8Bytes(text, limit);
    const candidateMessage: LiveTranscriptMessage = {
      ...message,
      content: [...kept, { type: "text", text: candidate }],
    };
    if (countLiveMessageUtf8Bytes(candidateMessage) <= MAX_LIVE_PER_MESSAGE_UTF8_BYTES) {
      bounded = candidate;
      minimum = limit + 1;
    } else {
      maximum = limit - 1;
    }
  }

  return bounded;
}

function normalizeAssistantContent(
  content: unknown,
  truncate: (text: string) => string,
): LiveTranscriptContentBlock[] | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content.flatMap((block): LiveTranscriptContentBlock[] => {
    if (!isRecord(block)) {
      return [];
    }
    if (block.type === "text" && typeof block.text === "string") {
      return [{ type: "text", text: truncate(block.text) }];
    }
    if (block.type === "thinking" && typeof block.thinking === "string") {
      const thinkingSignature = normalizeThinkingSignature(block.thinkingSignature, truncate);
      return [{ type: "thinking", thinking: truncate(block.thinking), thinkingSignature }];
    }
    if (block.type === "toolCall" && typeof block.id === "string" && typeof block.name === "string") {
      return [
        {
          type: "toolCall",
          id: truncate(block.id),
          name: truncate(block.name),
          arguments: boundedDetails(block.arguments) ?? {},
        },
      ];
    }
    return [];
  });
}

function normalizeToolResultContent(
  content: unknown,
  truncate: (text: string) => string,
): LiveTranscriptContentBlock[] | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content.flatMap((block): LiveTranscriptContentBlock[] => {
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") {
      return [];
    }
    return [{ type: "text", text: truncate(block.text) }];
  });
}

/**
 * Bounds a thinking signature, mirroring the desktop-side shape
 * (id/type/summary) the transcript renderer reads. Strings are truncated to
 * the per-message budget; the summary array is item-capped and total-bytes
 * capped.
 */
function normalizeThinkingSignature(
  signature: unknown,
  truncate: (text: string) => string,
): string | LiveTranscriptThinkingSignature | undefined {
  if (typeof signature === "string") {
    return truncate(signature);
  }
  if (!isRecord(signature)) {
    return undefined;
  }

  const normalized: LiveTranscriptThinkingSignature = {};
  if (typeof signature.id === "string") {
    normalized.id = truncate(signature.id);
  }
  if (typeof signature.type === "string") {
    normalized.type = truncate(signature.type);
  }
  if (Array.isArray(signature.summary)) {
    const summary: { type: string; text: string }[] = [];
    let summaryBytes = 0;
    for (const item of signature.summary.slice(0, MAX_LIVE_DETAILS_ITEMS)) {
      if (!isRecord(item) || typeof item.type !== "string" || typeof item.text !== "string") {
        continue;
      }
      const boundedType = truncate(item.type);
      const boundedText = truncate(item.text);
      const cost = countUtf8Bytes(boundedType) + countUtf8Bytes(boundedText) + 4;
      if (summaryBytes + cost > MAX_LIVE_DETAILS_UTF8_BYTES) {
        break;
      }
      summary.push({ type: boundedType, text: boundedText });
      summaryBytes += cost;
    }
    if (summary.length > 0) {
      normalized.summary = summary;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/** Copies only the numeric usage fields; the payload stays bounded by construction. */
function normalizeUsage(value: unknown): LiveTranscriptUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const usage: LiveTranscriptUsage = {};
  for (const key of ["input", "output", "cacheRead", "cacheWrite", "reasoning", "totalTokens", "total"] as const) {
    const numberValue = value[key];
    if (typeof numberValue === "number") {
      usage[key] = numberValue;
    }
  }
  const cost = value.cost;
  if (isRecord(cost)) {
    const normalizedCost: NonNullable<LiveTranscriptUsage["cost"]> = {};
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
      const numberValue = cost[key];
      if (typeof numberValue === "number") {
        normalizedCost[key] = numberValue;
      }
    }
    usage.cost = normalizedCost;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
