import type { SubagentRun } from "./subagents";
import type { ToolCallEntity, ToolCallOperation, ToolCallsState, ToolExecutionState } from "./toolCalls.types";

/** Provenance supplied by the adapter; generated IDs are not cross-snapshot anchors. */
export type TranscriptSource = {
  readonly id: string;
  readonly stability: "stable" | "generated";
  readonly origin: "live" | "snapshot";
};

/** Normalized content, not a protocol payload. Tool ownership comes from typed operations. */
export type ContentObservation =
  | { readonly kind: "text"; readonly text: string; readonly source?: TranscriptSource }
  | {
      readonly kind: "thinking";
      readonly text: string;
      readonly signature?: string | Readonly<Record<string, unknown>>;
      readonly source?: TranscriptSource;
    }
  | { readonly kind: "tool"; readonly callId: string; readonly source?: TranscriptSource };

/** Assistant content and renderer/history timing observations. */
export type AssistantObservation = {
  readonly kind: "assistant";
  readonly source: TranscriptSource;
  readonly blocks: readonly ContentObservation[];
  readonly isStreaming: boolean;
  readonly timestampMs?: number;
  readonly startedAtMs?: number;
  readonly durationMs?: number;
};

/** Already validated child notice; it does not contribute to parent timing or summary. */
export type CompletionContent = {
  readonly childSessionId?: string;
  readonly agentId?: string;
  readonly agentName?: string;
  readonly text: string;
  readonly outcome: "unknown" | "succeeded" | "failed" | "interrupted";
};

/** An unowned result with no protocol call identity; source is presentation provenance only. */
export type UnmatchedResultContent = {
  readonly text: string;
  readonly toolName?: string;
  readonly isError: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
};

/** Chronological typed observations. Unresolved references explicitly retain orphan facts. */
export type TranscriptObservation =
  | AssistantObservation
  | ({ readonly kind: "unmatched"; readonly source: TranscriptSource } & UnmatchedResultContent)
  | { readonly kind: "user"; readonly source: TranscriptSource; readonly text: string; readonly timestampMs?: number }
  | { readonly kind: "completion"; readonly source: TranscriptSource; readonly completion: CompletionContent }
  | { readonly kind: "unresolved"; readonly source: TranscriptSource; readonly callId: string };

/**
 * A complete current window. generation/update are caller-local ordering and authority,
 * not upstream revisions. Higher generation wins; within it higher update wins.
 * Replaying the same pair is idempotent (its observations/operations must be immutable).
 * Every accepted window authoritatively defines retained calls by tool/unresolved refs.
 */
export type TranscriptSnapshot = {
  readonly sessionId: string;
  readonly generation: number;
  readonly update: number;
  readonly authority: "current" | "stale";
  readonly observations: readonly TranscriptObservation[];
  readonly toolOperations: readonly ToolCallOperation[];
  readonly isWorking: boolean;
};

/** Display-only thinking content. */
export type ThinkingBlock = {
  readonly kind: "thinking";
  readonly text: string;
  readonly signature?: string | Readonly<Record<string, unknown>>;
  readonly source?: TranscriptSource;
  readonly isStreaming: boolean;
};

/** Ordered group member; execution is owned exclusively by the tool-call reducer. */
export type GroupMember = ThinkingBlock | { readonly kind: "tool"; readonly callId: string };

/** First-class group with unique-call counts (not counts of duplicate references). */
export type ToolCallGroup = {
  readonly kind: "toolGroup";
  readonly id: string;
  readonly members: readonly GroupMember[];
  readonly callCount: number;
  readonly stateCounts: Readonly<Record<ToolExecutionState, number>>;
};

/** Ordered turn body; no protocol messages are retained. */
export type TurnBlock =
  | ThinkingBlock
  | ToolCallGroup
  | { readonly kind: "text"; readonly text: string; readonly isStreaming: boolean };

/** Last assistant's trailing text and pure-answer thinking. */
export type TurnSummary = {
  readonly text: string | null;
  readonly thinking: readonly ThinkingBlock[];
  readonly isStreaming: boolean;
};

/** One completion-separated display segment with logical-parent timing. */
export type TranscriptTurn = {
  readonly id: string;
  readonly blocks: readonly TurnBlock[];
  readonly summary: TurnSummary | null;
  readonly isWorking: boolean;
  readonly timingContinues: boolean;
  readonly startedAtMs?: number;
  readonly startTimestampMs?: number;
  readonly workedDurationMs: number | null;
};

/** Session-level rows; orphan results are visible without a fake successful tool card. */
export type TranscriptRow =
  | ({ readonly kind: "unmatched"; readonly id: string; readonly source: TranscriptSource } & UnmatchedResultContent)
  | { readonly kind: "user"; readonly id: string; readonly text: string; readonly timestampMs?: number }
  | { readonly kind: "turn"; readonly turn: TranscriptTurn }
  | { readonly kind: "completion"; readonly id: string; readonly completion: CompletionContent }
  | { readonly kind: "unresolved"; readonly id: string; readonly callId: string; readonly entity?: ToolCallEntity };

/** Active identity registration; removed entities do not retain registrations. */
export type IdentityEntry = {
  readonly id: string;
  readonly kind: string;
  readonly scope: string;
  readonly anchors: readonly string[];
};

/** Caller-owned immutable composition state, isolated to one session. */
export type TranscriptState = {
  readonly sessionId: string;
  readonly namespace: string;
  readonly counter: number;
  readonly generation: number;
  readonly update: number;
  readonly registry: readonly IdentityEntry[];
  readonly toolCalls: ToolCallsState;
  readonly rows: readonly TranscriptRow[];
  /** Current raw-window child sessions, keyed only by real child identity. */
  readonly childRuns?: ReadonlyMap<string, SubagentRun>;
};
