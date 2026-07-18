/** Status of an agent chat session. */
export type AgentSessionState = "starting" | "running" | "idle" | "error";

export type AgentPendingUiOption = {
  index?: number;
  value: string;
  label: string;
  description?: string;
};

/** One pending RPC extension UI request that requires a desktop response. */
export type AgentPendingUiRequest = {
  id: string;
  method: "select" | "confirm" | "input" | "editor";
  title: string;
  message?: string;
  options?: AgentPendingUiOption[];
  placeholder?: string;
  prefill?: string;
  allowFreeform?: boolean;
  selectionMode?: "single" | "multiple";
};

export type AgentPendingUiAutoResponse = {
  sourceRequestId: string;
  targetMethod: "input" | "editor";
  value: string;
};

/** One summary line exposed by Pi reasoning metadata. */
export type AgentThinkingSignatureSummary = {
  type: string;
  text: string;
};

/** Optional Pi reasoning metadata attached to a thinking block. */
export type AgentThinkingSignature = {
  id?: string;
  type?: string;
  summary?: AgentThinkingSignatureSummary[];
};

/** A content block within an assistant message. Mirrors pi RPC content types. */
export type AgentContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; thinkingSignature?: string | AgentThinkingSignature }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };

/** A single message in an agent conversation. */
export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "toolResult" | "custom";
  /** String for user/custom messages, content blocks for assistant, text array for tool results. */
  content: string | AgentContentBlock[];
  /** Extension-defined message type for custom messages. */
  customType?: string;
  /** Whether Pi intends the custom message to appear in the default transcript. */
  display?: boolean;
  /** Tool result metadata. */
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: Record<string, unknown>;
  /** Usage info from assistant messages. */
  usage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
    total?: number;
    totalTokens?: number;
    cost?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      total?: number;
    };
  };
  /** Stop reason from assistant messages. */
  stopReason?: string;
  /** Provider-supplied assistant error message when the turn stops with an error. */
  errorMessage?: string;
  timestamp?: number;
  startedAtMs?: number;
  durationMs?: number;
};

/** An AI model available for selection. */
export type AgentModel = {
  id: string;
  name: string;
  provider?: string;
  contextWindow?: number;
  reasoning?: boolean;
};

/** Streaming delta event from pi RPC. */
export type AgentStreamEvent =
  | { type: "start" }
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number; content: string }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "thinking_end"; contentIndex: number; content: string }
  | { type: "toolcall_start"; contentIndex: number; toolCallId: string; toolName: string }
  | { type: "toolcall_delta"; contentIndex: number; toolCallId: string; delta: string }
  | {
      type: "toolcall_end";
      contentIndex: number;
      toolCallId: string;
      toolCall: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | { type: "done"; reason: string }
  | { type: "error"; reason: string };

/** Queue state for steering and follow-up messages. */
export type AgentQueueState = {
  steering: string[];
  followUp: string[];
};
