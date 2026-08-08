import type { AgentContentBlock, AgentMessage, AgentThinkingSignature } from "../../../store/agentChatTypes";
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
 */
export function buildTranscriptRows(displayMessages: TurnItem[]): TranscriptRow[] {
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
    if (typeof item.message.durationMs === "number") {
      currentTurn.workedDurationMs = (currentTurn.workedDurationMs ?? 0) + item.message.durationMs;
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
 * appears, which starts a text section and splits the run. The summary text of
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

    blocks.forEach((block, blockIndex) => {
      if (block.type === "thinking") {
        if (block.thinking.trim().length === 0) {
          return;
        }
        // The last (summary) message's thinking stays with the message, outside the tool stack.
        if (isSummaryMessage) {
          return;
        }
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
 * Returns the elapsed working time for a finished turn: the accumulated
 * durationMs of its assistant messages, or a timestamp-derived fallback for
 * history-loaded turns that lack durationMs. While the turn is still working
 * the header shows "working…" instead, so returns null.
 */
export function getTurnWorkedDurationMs(turn: Turn): number | null {
  if (turn.isWorking) {
    return null;
  }

  if (turn.workedDurationMs !== null) {
    return turn.workedDurationMs;
  }

  // History-loaded turns lack durationMs; derive the worked time from the
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
 * Returns the thinking blocks of the last assistant (summary) message, which
 * stay with the message outside the tool stack.
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
