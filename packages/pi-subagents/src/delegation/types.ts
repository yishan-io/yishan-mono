import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionFactory, SessionManager } from "@earendil-works/pi-coding-agent";

/** Lifecycle states for one managed sub-agent run. */
export type AgentStatus = "queued" | "starting" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

/** Execution mode for one agent run. */
export type AgentRunMode = "foreground" | "background";

/** Declared workspace access required for one agent run. */
export type WorkspaceAccess = "read" | "write";

/** Shared usage summary captured from one agent run. */
export interface AgentUsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

/** Live SDK state with no session mutation or lifecycle controls. Arrays are not cloned. */
export interface AgentObservation {
  readonly messages: readonly AgentMessage[];
  readonly model: Readonly<Model<Api>> | undefined;
  readonly thinkingLevel: ThinkingLevel;
}

/** Neutral identity supplied to optional persistence/lifecycle adapters. */
export interface ChildSessionReference {
  agentId: string;
  agentName: string;
  mode: AgentRunMode;
  sessionId: string;
  sessionPath?: string;
}

/** Already-resolved SDK configuration and optional generic adapter hooks. */
export interface ChildSessionOptions {
  agentId: string;
  agentName: string;
  mode: AgentRunMode;
  cwd: string;
  systemPrompt: string;
  model?: string;
  parentModel?: Model<Api>;
  parentThinking?: ThinkingLevel;
  thinking?: ThinkingLevel;
  tools?: string[];
  parentSessionPath?: string;
  resolveExtensions?: () => Promise<ExtensionFactory[]>;
  onSessionCreated?: (manager: SessionManager, reference: ChildSessionReference) => void;
  onStarted?: (reference: ChildSessionReference & { createdAt: string }) => void;
  onCompleted?: (result: AgentResult) => void;
}

/** Neutral executable request; role policy is resolved before admission. */
export interface AgentTask extends Omit<ChildSessionOptions, "agentId"> {
  parent?: Readonly<AgentParentCorrelation>;
  prompt: string;
  maxTurns?: number;
  timeoutMs?: number;
  workspaceAccess: WorkspaceAccess;
}

/** Result returned when one managed agent run finishes. */
export interface AgentResult {
  agentId: string;
  agentName: string;
  sessionId?: string;
  sessionPath?: string;
  status: Extract<AgentStatus, "completed" | "failed" | "cancelled">;
  responseText?: string;
  error?: string;
  usage: AgentUsageStats;
  cancellationOrigin?: AgentCancellationOrigin;
}

/** Mutable runtime record tracked by the shared agent manager. */
export interface AgentRecord {
  id: string;
  agentName: string;
  prompt: string;
  status: AgentStatus;
  mode: AgentRunMode;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  session?: AgentObservation;
  sessionId?: string;
  sessionPath?: string;
  responseText?: string;
  error?: string;
  usage: AgentUsageStats;
  cancellationOrigin?: AgentCancellationOrigin;
}

/** Shared empty usage value for agent initialization paths. */
export const emptyAgentUsageStats: AgentUsageStats = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  contextTokens: 0,
  turns: 0,
};

/** Immutable parent correlation supplied by the launch surface, not inferred from history. */
export interface AgentParentCorrelation {
  sessionId: string;
  lifetime?: string;
  toolCallId?: string;
  source?: "tool" | "command";
}

/** Emitted once, after the final record has been applied. */
export interface AgentTerminalEvent {
  record: AgentRecord;
  result: AgentResult;
  parent?: Readonly<AgentParentCorrelation>;
}

/** Isolates optional adapters and observers from execution settlement. */
export function invokeAgentObserver(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch (error) {
    console.warn("[pi-subagents] observer failed", error);
  }
}

/** First accepted interruption reason for a run. */
export type AgentCancellationOrigin = "user" | "caller" | "shutdown" | "timeout" | "maxTurns";

/** Run-scoped intent survives queueing and asynchronous session assembly. */
export class AgentCancellation {
  private readonly controller = new AbortController();
  origin?: AgentCancellationOrigin;
  get signal(): AbortSignal {
    return this.controller.signal;
  }
  request(origin: AgentCancellationOrigin): void {
    if (this.signal.aborted) return;
    this.origin = origin;
    this.controller.abort(origin);
  }
}
