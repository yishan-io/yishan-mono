import type { AgentRecord } from "../agents/types";
import {
  MAX_LIVE_AGGREGATE_UTF8_BYTES,
  MAX_LIVE_PAYLOAD_OVERHEAD_BYTES,
  MAX_LIVE_PER_CHILD_UTF8_BYTES,
  countUtf8Bytes,
} from "./liveTranscriptBudget";
import { type LiveTranscriptMessage, countLiveMessageUtf8Bytes, normalizeLiveMessages } from "./liveTranscriptMessage";

/**
 * Live-transcript payload builder for the pi-subagents-live-transcripts widget.
 *
 * Bounded, active-children-only snapshot: per-message UTF-8 caps, bounded
 * details/arguments, last MAX_LIVE_MESSAGES_PER_CHILD messages, per-child byte
 * trim, and an aggregate cap verified on the serialized widget (including the
 * JSON envelope). Session messages are never mutated.
 */

export interface LiveTranscriptAgent {
  agentId: string;
  childSessionId: string;
  status: string;
  messages: LiveTranscriptMessage[];
  thinkingLevel?: string;
  model?: {
    id: string;
    name: string;
    provider?: string;
    reasoning?: boolean;
    contextWindow?: number;
    thinkingLevelMap?: Record<string, string | null>;
  };
}

export interface LiveTranscriptPayload {
  version: 1;
  agents: LiveTranscriptAgent[];
}

/** Budget enforcement counters for one payload build (and diagnostics). */
export interface LiveTranscriptBudgetStats {
  /** Messages before any count/byte trimming (active children only). */
  totalMessagesBefore: number;
  /** Messages after per-child and aggregate trimming. */
  totalMessagesAfter: number;
  /** Number of strings truncated to fit a budget. */
  truncatedStrings: number;
  /** Messages dropped by per-child or aggregate byte trims. */
  droppedMessages: number;
  /** Children dropped by the aggregate byte cap. */
  droppedChildren: number;
  /** Sum of content bytes before aggregate trimming. */
  bytesBefore: number;
  /** Sum of content bytes in the final payload. */
  bytesAfter: number;
}

export function emptyLiveTranscriptBudgetStats(): LiveTranscriptBudgetStats {
  return {
    totalMessagesBefore: 0,
    totalMessagesAfter: 0,
    truncatedStrings: 0,
    droppedMessages: 0,
    droppedChildren: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };
}

const ACTIVE_LIVE_STATUSES = new Set(["queued", "starting", "running"]);

/**
 * Builds a bounded live-transcript payload from tracked agent records.
 *
 * - Only active children (queued/starting/running) with a session are included.
 * - Messages are normalized to a bounded shape: per-message UTF-8 caps,
 *   bounded details/arguments, dropped image blocks, last
 *   MAX_LIVE_MESSAGES_PER_CHILD messages kept.
 * - Per-child bytes are trimmed to MAX_LIVE_PER_CHILD_UTF8_BYTES (keep newest).
 * - Children are dropped oldest-first (newest kept) until the aggregate content
 *   budget fits; the serialized widget is verified against the ceiling plus
 *   JSON-overhead slack (at least one child is always kept).
 *
 * The per-message, per-details, and per-child caps together guarantee that a
 * single child's widget stays well below the aggregate ceiling, so keeping one
 * child can never bypass the cap.
 *
 * Never mutates session messages; every emitted value is a fresh bounded copy.
 */
export function buildLiveTranscriptPayload(records: readonly AgentRecord[]): {
  payload: LiveTranscriptPayload | undefined;
  stats: LiveTranscriptBudgetStats;
} {
  const stats = emptyLiveTranscriptBudgetStats();

  const agents: LiveTranscriptAgent[] = [];
  for (const record of records) {
    if (!ACTIVE_LIVE_STATUSES.has(record.status) || !record.sessionId || !record.session) {
      continue;
    }

    const { messages, truncated } = normalizeLiveMessages(record.session.messages ?? []);
    stats.totalMessagesBefore += (record.session.messages ?? []).length;
    stats.totalMessagesAfter += messages.length;
    stats.truncatedStrings += truncated;

    agents.push({
      agentId: record.id,
      childSessionId: record.sessionId,
      status: record.status,
      messages,
      thinkingLevel: record.session.thinkingLevel,
      model: record.session.model
        ? {
            id: record.session.model.id,
            name: record.session.model.name,
            provider: record.session.model.provider,
            reasoning: record.session.model.reasoning,
            contextWindow: record.session.model.contextWindow,
            thinkingLevelMap: record.session.model.thinkingLevelMap,
          }
        : undefined,
    });
  }

  if (agents.length === 0) {
    return { payload: undefined, stats };
  }

  // Per-child byte cap (keep newest messages).
  for (const agent of agents) {
    const trimmed = trimChildMessages(agent.messages, MAX_LIVE_PER_CHILD_UTF8_BYTES);
    stats.droppedMessages += agent.messages.length - trimmed.length;
    agent.messages = trimmed;
  }

  stats.bytesBefore = agents.reduce((sum, agent) => sum + countChildBytes(agent.messages), 0);

  // Aggregate byte cap across children (drop oldest children, keep newest).
  // Verified on the serialized widget so the JSON envelope is included in the
  // guarantee. A single remaining child is always within the ceiling because
  // the per-message/per-details/per-child caps bound it well below aggregate.
  let payload: LiveTranscriptPayload | undefined = { version: 1, agents };
  let widget = JSON.stringify(payload);
  while (
    agents.length > 1 &&
    widget !== undefined &&
    countUtf8Bytes(widget) > MAX_LIVE_AGGREGATE_UTF8_BYTES + MAX_LIVE_PAYLOAD_OVERHEAD_BYTES
  ) {
    agents.shift();
    stats.droppedChildren += 1;
    payload = { version: 1, agents };
    widget = JSON.stringify(payload);
  }

  stats.totalMessagesAfter = agents.reduce((sum, agent) => sum + agent.messages.length, 0);
  stats.bytesAfter = agents.reduce((sum, agent) => sum + countChildBytes(agent.messages), 0);

  return { payload, stats };
}

function countChildBytes(messages: readonly LiveTranscriptMessage[]): number {
  return messages.reduce((sum, message) => sum + countLiveMessageUtf8Bytes(message), 0);
}

/** Trims a child's messages to a byte budget, keeping the newest messages. */
function trimChildMessages(messages: LiveTranscriptMessage[], budgetBytes: number): LiveTranscriptMessage[] {
  if (messages.length <= 1 || countChildBytes(messages) <= budgetBytes) {
    return messages;
  }

  const kept: LiveTranscriptMessage[] = [];
  let totalBytes = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    const messageBytes = countLiveMessageUtf8Bytes(message);
    if (totalBytes + messageBytes <= budgetBytes || kept.length === 0) {
      kept.unshift(message);
      totalBytes += messageBytes;
    } else {
      break;
    }
  }
  return kept;
}
