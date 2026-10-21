import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentRunMode, WorkspaceAccess } from "../delegation";
import type {
  ChildSessionDescriptor,
  ParentSessionReference,
  ParentSessionWriter,
} from "../runtime/sessionRelationship";
export {
  emptyAgentUsageStats,
  type AgentObservation,
  type AgentRecord,
  type AgentResult,
  type AgentRunMode,
  type AgentStatus,
  type AgentUsageStats,
  type WorkspaceAccess,
} from "../delegation";

/** Supported sources for one resolved agent definition. */
export type AgentDefinitionSource = "builtin" | "user" | "project";

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

/** A definition with a valid name but validation errors that prevents execution. */
export interface InvalidAgentDefinition {
  name: string;
  source: AgentDefinitionSource;
  sourcePath?: string;
  diagnostics: AgentDefinitionDiagnostic[];
}

/** Input required to start one managed sub-agent run. */
export interface AgentTask {
  agentName: string;
  prompt: string;
  mode: AgentRunMode;
  cwd: string;
  /** Tool call ID that initiated this child run, when the parent was a tool invocation. */
  parentToolCallId?: string;
  parentSession?: ParentSessionReference;
  parentSessionWriter?: ParentSessionWriter;
  childSessionDescriptor?: ChildSessionDescriptor;
  agentDefinition?: AgentDefinition;
  tools?: string[];
  model?: string;
  /** Parent session's already-resolved model, used as an auth-checked fallback. */
  parentModel?: Model<Api>;
  /** Parent session's current thinking level, used as a fallback when model resolution falls back. */
  parentThinking?: ThinkingLevel;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  timeoutMs?: number;
  workspaceAccess: WorkspaceAccess;
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
  invalidAgentsByName?: Map<string, InvalidAgentDefinition>;
}
