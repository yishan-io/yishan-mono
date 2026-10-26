import type { ToolExecutionState } from "./toolCalls.types";
import type { CompletionContent, TranscriptRow, TranscriptTurn } from "./types";

/** Existing renderers whose arguments contain no required display fields. */
export type OptionalRenderer =
  | { readonly kind: "askUser"; readonly toolName: "ask_user" }
  | { readonly kind: "memoryStore"; readonly toolName: "memory_store" }
  | { readonly kind: "lsp"; readonly toolName: "lsp_diagnostics" | "lsp_fix" }
  | {
      readonly kind: "workspace";
      readonly toolName: "workspace_list" | "workspace_find" | "workspace_create" | "workspace_close";
    }
  | {
      readonly kind: "task";
      readonly toolName: "task_start" | "task_list" | "task_read" | "task_write" | "task_append_note" | "task_finish";
    }
  | {
      readonly kind: "codeGraph";
      readonly toolName:
        | "codegraph_search"
        | "codegraph_callers"
        | "codegraph_callees"
        | "codegraph_impact"
        | "codegraph_explore"
        | "codegraph_node"
        | "codegraph_status"
        | "codegraph_files";
    };

/** Validated required fields; generic fallback retains the original descriptor. */
export type ToolRendererPayload =
  | { readonly kind: "generic" }
  | { readonly kind: "read" | "memoryRead" | "diff"; readonly path: string }
  | { readonly kind: "bash"; readonly command: string }
  | { readonly kind: "agent"; readonly agent: string; readonly prompt: string }
  | { readonly kind: "grep"; readonly pattern: string }
  | { readonly kind: "memorySearch"; readonly query: string }
  | { readonly kind: "webFetch"; readonly urls: readonly [string, ...string[]] }
  | OptionalRenderer;

/** Result display content, never a protocol message. */
export type ResultDisplay = {
  readonly text: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly isError: boolean;
};

/** Pure card projection; presence of result content is not execution evidence. */
export type ToolCardModel = {
  readonly kind: "card";
  readonly sessionId: string;
  readonly callId: string;
  readonly toolCall: {
    readonly id: string;
    readonly name: string;
    readonly arguments: Readonly<Record<string, unknown>>;
  };
  readonly rendererKind: ToolRendererPayload["kind"];
  readonly renderer: ToolRendererPayload;
  readonly result: ResultDisplay | null;
  readonly executionState: ToolExecutionState;
  readonly presentationState: ToolExecutionState;
  readonly isError: boolean;
  readonly hasResult: boolean;
  readonly completeness: "missing" | "unknown" | "partial" | "complete";
  readonly isPending: boolean;
  readonly isLive: boolean;
  readonly agentStatus: ToolExecutionState | null;
  /** Canonical display label only; does not change execution state. */
  readonly agentStatusLabel?: string;
  readonly agentLabel?: string;
  readonly navigationTarget?: { readonly childSessionId: string; readonly agentId?: string; readonly title: string };
};

/** Reasoning display key is not a protocol identity. */
export type ThinkingDisplay = {
  readonly kind: "thinking";
  readonly key: string;
  readonly text: string;
  readonly summary: string | null;
  readonly hasDetails: boolean;
  readonly isStreaming: boolean;
};

/** Ordered unique-call summary, translated by the consumer. */
export type GroupSummaryItem = {
  readonly key: "read" | "bash" | "edited" | "searched" | "used";
  readonly count: number;
  readonly toolName?: string;
};

/** A group reuses card projections and computes execution-based collapsed members. */
export type GroupDisplay = {
  readonly kind: "group";
  readonly id: string;
  readonly members: readonly (ThinkingDisplay | ToolCardModel)[];
  readonly pendingMembers: readonly (ThinkingDisplay | ToolCardModel)[];
  readonly summaryItems: readonly GroupSummaryItem[];
  readonly callCount: number;
  readonly isLive: boolean;
};

/** Timing and summary structure remain canonical; only render content is projected. */
export type TurnDisplay = Omit<TranscriptTurn, "blocks" | "summary"> & {
  readonly blocks: readonly (
    | ThinkingDisplay
    | GroupDisplay
    | { readonly kind: "text"; readonly text: string; readonly isStreaming: boolean }
  )[];
  readonly summary: {
    readonly text: string | null;
    readonly thinking: readonly ThinkingDisplay[];
    readonly isStreaming: boolean;
  } | null;
};

/** No raw messages, result merge maps, or ledger entities cross this boundary. */
export type DisplayRow =
  | (Omit<Extract<TranscriptRow, { kind: "unmatched" }>, "toolName"> & { readonly toolName: string })
  | { readonly kind: "user"; readonly id: string; readonly text: string; readonly timestampMs?: number }
  | { readonly kind: "turn"; readonly turn: TurnDisplay }
  | { readonly kind: "completion"; readonly id: string; readonly completion: CompletionContent }
  | { readonly kind: "unresolved"; readonly id: string; readonly callId: string; readonly card: ToolCardModel };

/** Optional usage has already been normalized by the caller. */
export type TranscriptDisplay = {
  readonly rows: readonly DisplayRow[];
  readonly contextTokens?: number;
};
