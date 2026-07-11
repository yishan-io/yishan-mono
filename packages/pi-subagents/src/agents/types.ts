import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

import type {
  ChildSessionDescriptor,
  ParentSessionReference,
  ParentSessionWriter,
} from "../runtime/sessionRelationship";

/** Supported sources for one resolved agent definition. */
export type AgentDefinitionSource = "builtin" | "user" | "project";

/** Lifecycle states for one managed sub-agent run. */
export type AgentStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** Execution mode for one agent run. */
export type AgentRunMode = "foreground" | "background";

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

/** Canonical agent definition loaded from built-in, user, or project sources. */
export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  thinking?: ThinkingLevel;
  tools?: string[];
  defaultBackground?: boolean;
  maxTurns?: number;
  timeoutMs?: number;
  readOnly?: boolean;
  source: AgentDefinitionSource;
  sourcePath?: string;
}

/** Input required to start one managed sub-agent run. */
export interface AgentTask {
  agentName: string;
  prompt: string;
  mode: AgentRunMode;
  cwd: string;
  parentSession?: ParentSessionReference;
  parentSessionWriter?: ParentSessionWriter;
  childSessionDescriptor?: ChildSessionDescriptor;
  agentDefinition?: AgentDefinition;
  tools?: string[];
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  timeoutMs?: number;
  readOnly?: boolean;
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
  session?: AgentSession;
  sessionId?: string;
  sessionPath?: string;
  responseText?: string;
  error?: string;
  usage: AgentUsageStats;
}

/** Diagnostics produced while loading agent definitions. */
export interface AgentDefinitionDiagnostic {
  path?: string;
  message: string;
}

/** Result of loading and resolving all visible agent definitions. */
export interface AgentRegistrySnapshot {
  agents: AgentDefinition[];
  diagnostics: AgentDefinitionDiagnostic[];
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
