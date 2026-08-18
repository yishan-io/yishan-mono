import type {
  AgentContentBlock,
  AgentMessage,
  AgentThinkingSignature,
} from "../../../../domains/agent/model/agentChatTypes";
import { type AgentToolResultMap, extractMessageText } from "./helpers";

/** One display message inside a turn (assistant messages with merged tool results). */
export type TurnItem = {
  message: AgentMessage;
  mergedToolResults: AgentToolResultMap;
  isStreaming: boolean;
};

/** One collapsible assistant turn: the assistant response(s) after a user message. */
export type Turn = {
  id: string;
  items: TurnItem[];
  isWorking: boolean;
  workedDurationMs: number | null;
  /** Timestamp of the preceding user message; used to derive worked time for history-loaded turns that lack durationMs. */
  startTimestampMs?: number;
  /** When the turn began working (first assistant item's startedAtMs); base for the live elapsed header. */
  startedAtMs?: number;
};

/** One row of the transcript: a standalone user message or a collapsible assistant turn. */
export type TranscriptRow = { kind: "user"; message: AgentMessage } | { kind: "turn"; turn: Turn };

/** One tool call paired with its merged result, grouped at turn level. */
export type TurnToolCall = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result: AgentMessage | null;
};

/** One working block of a turn: a thinking block or a tool call, in original order. */
export type TurnWorkingBlock =
  | {
      kind: "thinking";
      id: string;
      thinking: string;
      thinkingSignature?: string | AgentThinkingSignature;
      isStreaming: boolean;
    }
  | {
      kind: "toolCall";
      id: string;
      toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
      result: AgentMessage | null;
      isStreaming: boolean;
    };

/**
 * Builds the transcript rows. A turn group starts at an assistant message:
 * consecutive assistant messages (with their merged tool results) form one
 * turn until the next user message. User messages are standalone rows and are
 * never part of a collapsible turn. Unmatched tool result messages (no owning
 * tool call in the transcript) stay visible inside the current turn so no
 * message content is lost.
 *
 * When `isWorking` is true (the session is actively running), the last turn is
 * kept marked as working even between messages of the same turn so the turn
 * header stays the single working indicator for the whole turn.
 */
export function buildTranscriptRows(displayMessages: TurnItem[], isWorking = false): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let currentTurn: Turn | null = null;
  let lastUserTimestamp: number | undefined;

  for (const item of displayMessages) {
    if (item.message.role === "user") {
      currentTurn = null;
      lastUserTimestamp = typeof item.message.timestamp === "number" ? item.message.timestamp : undefined;
      rows.push({ kind: "user", message: item.message });
      continue;
    }

    if (item.message.role === "toolResult") {
      if (!currentTurn) {
        currentTurn = createTurn(item.message.id, lastUserTimestamp);
        rows.push({ kind: "turn", turn: currentTurn });
      }
      currentTurn.items.push(item);
      continue;
    }

    if (item.message.role !== "assistant") {
      continue;
    }

    if (!currentTurn) {
      currentTurn = createTurn(item.message.id, lastUserTimestamp);
      rows.push({ kind: "turn", turn: currentTurn });
    }

    currentTurn.items.push(item);
    if (item.isStreaming) {
      currentTurn.isWorking = true;
    }
    if (currentTurn.startedAtMs === undefined && typeof item.message.startedAtMs === "number") {
      currentTurn.startedAtMs = item.message.startedAtMs;
    }
    if (typeof item.message.durationMs === "number") {
      currentTurn.workedDurationMs = (currentTurn.workedDurationMs ?? 0) + item.message.durationMs;
    }
  }

  if (isWorking) {
    // Only the trailing turn can be the running one; when the last row is a
    // user message the new turn has not started emitting yet.
    const lastRow = rows[rows.length - 1];
    if (lastRow?.kind === "turn") {
      lastRow.turn.isWorking = true;
    }
  }

  return rows;
}

function createTurn(id: string, startTimestampMs?: number): Turn {
  return {
    id,
    items: [],
    isWorking: false,
    workedDurationMs: null,
    startTimestampMs,
  };
}

/**
 * One content section of a turn's collapsible body: a run of consecutive
 * working blocks (thinking + tool calls) or an intermediate text block.
 * Tool-call runs are split by normal text messages in the middle.
 */
export type TurnSection =
  | { kind: "text"; text: string; isStreaming: boolean }
  | { kind: "toolRun"; blocks: TurnWorkingBlock[] };

/**
 * Builds the turn's collapsible body sections in original order. Thinking and
 * tool calls accumulate into a tool-run section until a normal text block
 * appears, which starts a text section and splits the run. Thoughts of a
 * working message (one with tool calls) stay inside the tool run even across
 * the message's narration text; thoughts of text-only messages and thoughts
 * trailing a message's final tool call render standalone. The summary text of
 * the last assistant message is excluded (rendered separately).
 */
export function buildTurnSections(
  items: TurnItem[],
  summaryItemId: string | null,
  summaryText: string | null,
): TurnSection[] {
  const sections: TurnSection[] = [];
  let currentRun: TurnWorkingBlock[] | null = null;

  const flushRun = () => {
    if (currentRun && currentRun.length > 0) {
      sections.push({ kind: "toolRun", blocks: currentRun });
      currentRun = null;
    }
  };

  for (const item of items) {
    const blocks = Array.isArray(item.message.content) ? item.message.content : [];
    let lastToolCallIndex = -1;
    for (let index = 0; index < blocks.length; index += 1) {
      if (blocks[index]?.type === "toolCall") {
        lastToolCallIndex = index;
      }
    }
    const isSummaryItem = item.message.id === summaryItemId && summaryText !== null;
    const isSummaryMessage = item.message.id === summaryItemId;
    const messageHasToolCalls = lastToolCallIndex >= 0;
    // A last message that still carries tool calls is a working message: its
    // thinking belongs in the tool stack with the cards. Only the thinking of
    // the final text answer (no tool calls) stays with the message outside the
    // stack.
    const summaryMessageHasToolCalls = isSummaryMessage && messageHasToolCalls;

    // Thoughts of a working message (one with tool calls) belong in the tool run
    // with its cards, even when narration text sits between the thought and the
    // calls: hold them until the run resumes with the message's tool calls so the
    // text block in between never strands them standalone.
    const messagePendingThinking: Extract<TurnWorkingBlock, { kind: "thinking" }>[] = [];

    blocks.forEach((block, blockIndex) => {
      if (block.type === "thinking") {
        if (block.thinking.trim().length === 0) {
          return;
        }
        // The last (summary) message's thinking stays with the message, outside the tool
        // stack — but only when that message is a pure text answer. A still-working
        // last message (one that still has tool calls) keeps its thinking inside the
        // stack alongside its cards.
        if (isSummaryMessage && !summaryMessageHasToolCalls) {
          return;
        }
        if (messageHasToolCalls && blockIndex <= lastToolCallIndex) {
          // Working thought leading into this message's tool calls: it travels with
          // the tool run, so a text block in between must not strand it standalone
          // — attach it when the run resumes with the tool calls.
          messagePendingThinking.push({
            kind: "thinking",
            id: `${item.message.id}-thinking-${blockIndex}`,
            thinking: block.thinking,
            thinkingSignature: block.thinkingSignature,
            isStreaming: item.isStreaming,
          });
          return;
        }
        // A thought of a message without tool calls belongs with its text, and a
        // thought trailing the message's final tool call is not part of that run
        // either: flush the run and let the thought start a fresh run (which a
        // following tool call joins as its preamble — the same grouping as a
        // leading thought in the next message).
        flushRun();
        if (!currentRun) {
          currentRun = [];
        }
        currentRun.push({
          kind: "thinking",
          id: `${item.message.id}-thinking-${blockIndex}`,
          thinking: block.thinking,
          thinkingSignature: block.thinkingSignature,
          isStreaming: item.isStreaming,
        });
      } else if (block.type === "toolCall") {
        if (!currentRun) {
          currentRun = [];
        }
        // Attach this message's held working thoughts (they precede the calls in
        // the message, possibly after its narration text) before the tool call.
        if (messagePendingThinking.length > 0) {
          currentRun.push(...messagePendingThinking);
          messagePendingThinking.length = 0;
        }
        currentRun.push({
          kind: "toolCall",
          id: block.id,
          toolCall: block,
          result: item.mergedToolResults[block.id] ?? null,
          isStreaming: item.isStreaming,
        });
      } else if (block.type === "text") {
        if (isSummaryItem && blockIndex > lastToolCallIndex) {
          return;
        }
        flushRun();
        if (block.text.trim().length > 0) {
          sections.push({ kind: "text", text: block.text, isStreaming: item.isStreaming });
        }
      }
    });
  }

  flushRun();
  return sections;
}

/**
 * Returns the live elapsed working time for a running turn (base: the turn's
 * first assistant message start, falling back to the preceding user message
 * timestamp). Returns null when the turn is not working or no start time is
 * known, in which case the header falls back to the plain working label.
 */
export function getTurnLiveElapsedMs(turn: Turn, nowMs: number): number | null {
  if (!turn.isWorking) {
    return null;
  }

  const startMs = turn.startedAtMs ?? turn.startTimestampMs;
  if (typeof startMs !== "number" || !Number.isFinite(startMs)) {
    return null;
  }

  return Math.max(0, nowMs - startMs);
}

/**
 * Returns the finished elapsed wall-clock span of an in-memory turn: from the
 * first assistant's renderer `startedAtMs` to the final assistant's renderer
 * end (`startedAtMs + durationMs`). Both boundaries match the live header
 * (which starts counting at the first assistant start), so the completed
 * header never drops below the live elapsed value. Foreground tool execution
 * and any gap between Pi core turns are included exactly once.
 *
 * Returns null when either boundary is missing or not finite, so callers can
 * fall back to accumulated durations or the history timestamp fallback.
 */
export function getTurnElapsedSpanMs(turn: Turn): number | null {
  let firstStartedAtMs: number | null = null;
  let finalAssistant: TurnItem | null = null;

  for (const item of turn.items) {
    if (item.message.role !== "assistant") {
      continue;
    }
    finalAssistant = item;
    if (
      firstStartedAtMs === null &&
      typeof item.message.startedAtMs === "number" &&
      Number.isFinite(item.message.startedAtMs)
    ) {
      firstStartedAtMs = item.message.startedAtMs;
    }
  }

  if (firstStartedAtMs === null || finalAssistant === null) {
    return null;
  }

  const { startedAtMs, durationMs } = finalAssistant.message;
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
    return null;
  }
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return null;
  }

  return Math.max(0, startedAtMs + durationMs - firstStartedAtMs);
}

/**
 * Returns the elapsed working time for a finished turn. For an in-memory turn
 * with renderer timing on both boundaries it prefers the elapsed span (final
 * assistant end minus first assistant start), which includes foreground tool
 * execution and core-turn gaps once. Falls back to the accumulated assistant
 * durations for partial timing data, then to the user-to-last-assistant
 * timestamp span for history-loaded turns that lack renderer timing. While
 * the turn is still working the header shows the live elapsed time instead,
 * so returns null.
 */
export function getTurnWorkedDurationMs(turn: Turn): number | null {
  if (turn.isWorking) {
    return null;
  }

  const elapsedSpanMs = getTurnElapsedSpanMs(turn);
  if (elapsedSpanMs !== null) {
    return elapsedSpanMs;
  }

  // Partial timing data (for example a reloaded untimed tail or an aborted
  // final assistant): keep the accumulated assistant durations.
  if (turn.workedDurationMs !== null) {
    return turn.workedDurationMs;
  }

  // History-loaded turns lack renderer timing; derive the worked time from the
  // preceding user message timestamp and the last assistant message timestamp.
  const endTimestampMs = getLastAssistantTimestampMs(turn.items);
  if (typeof turn.startTimestampMs === "number" && Number.isFinite(turn.startTimestampMs) && endTimestampMs !== null) {
    return Math.max(0, endTimestampMs - turn.startTimestampMs);
  }
  return null;
}

function getLastAssistantTimestampMs(items: TurnItem[]): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const timestamp = item?.message.timestamp;
    if (item?.message.role === "assistant" && typeof timestamp === "number" && Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  return null;
}

/** Formats a worked duration like "worked 3s" or "worked 1m 5s". */
export function formatTurnDuration(durationMs: number): string {
  const roundedMs = Math.round(durationMs);
  if (roundedMs < 1000) {
    return `${roundedMs}ms`;
  }
  const seconds = Math.floor(roundedMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Returns the thinking blocks of the last assistant (summary) message when it
 * is a pure text answer (no tool calls), which stay with the message outside
 * the tool stack. Returns empty for a still-working last message (one that
 * still carries tool calls): its thinking belongs in the tool stack instead
 * (leading thoughts inside the run, a trailing thought standalone in the
 * body).
 */
export function extractTurnSummaryThinking(
  items: TurnItem[],
  summaryItemId: string | null,
): Extract<TurnWorkingBlock, { kind: "thinking" }>[] {
  const summaryItem = summaryItemId ? items.find((item) => item.message.id === summaryItemId) : null;
  if (!summaryItem) {
    return [];
  }

  const blocks = Array.isArray(summaryItem.message.content) ? summaryItem.message.content : [];
  if (blocks.some((block) => block.type === "toolCall")) {
    // The last message is still a working message (it carries tool calls): its
    // thinking belongs in the tool stack with the cards, not outside it.
    return [];
  }
  const thinking: Extract<TurnWorkingBlock, { kind: "thinking" }>[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type === "thinking" && block.thinking.trim().length > 0) {
      thinking.push({
        kind: "thinking",
        id: `${summaryItem.message.id}-thinking-${blockIndex}`,
        thinking: block.thinking,
        thinkingSignature: block.thinkingSignature,
        isStreaming: summaryItem.isStreaming,
      });
    }
  });
  return thinking;
}

/**
 * Returns the summary text of the turn: the text blocks of the last assistant
 * message that follow its final tool call (most turns end with a summary
 * answer). Returns null when there is no trailing summary text.
 */
export function extractTurnSummaryText(items: TurnItem[]): string | null {
  let lastAssistantItem: TurnItem | null = null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (candidate?.message.role === "assistant") {
      lastAssistantItem = candidate;
      break;
    }
  }
  if (!lastAssistantItem) {
    return null;
  }

  const blocks = Array.isArray(lastAssistantItem.message.content) ? lastAssistantItem.message.content : [];
  let lastToolCallIndex = -1;
  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index]?.type === "toolCall") {
      lastToolCallIndex = index;
    }
  }

  const summaryBlocks = lastToolCallIndex === -1 ? blocks : blocks.slice(lastToolCallIndex + 1);
  const text = extractMessageText(summaryBlocks).trim();
  return text.length > 0 ? text : null;
}
