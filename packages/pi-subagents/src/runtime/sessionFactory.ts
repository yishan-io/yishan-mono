import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { createAgentSessionFromServices } from "@earendil-works/pi-coding-agent";
import type { AgentDefinition, AgentRunMode } from "../agents/types";
import { type CreateChildAgentSessionResult, createDelegatedSession } from "../delegation";
import { resolveChildExtensionFactories } from "./childExtensions";
import type { ChildSessionDescriptor, ParentSessionReference } from "./sessionRelationship";
import { createSessionRelationshipHooks } from "./sessionRelationship";

export type { CreateChildAgentSessionResult } from "../delegation";
type SessionModel = NonNullable<Parameters<typeof createAgentSessionFromServices>[0]["model"]>;
/** Input required to create one isolated child agent session. */
export interface CreateChildAgentSessionOptions {
  agentId: string;
  agentName: string;
  cwd: string;
  mode: AgentRunMode;
  parentSession?: ParentSessionReference;
  childSessionDescriptor?: ChildSessionDescriptor;
  agentDefinition: AgentDefinition;
  model?: string;
  /** Parent session's already-resolved model, used as an auth-checked fallback. */
  parentModel?: SessionModel;
  /** Parent session's current thinking level, used as a fallback when model resolution falls back. */
  parentThinking?: ThinkingLevel;
  thinking?: ThinkingLevel;
  tools?: string[];
}

/** @deprecated Use neutral delegation requests for new integrations. Returns the original raw SDK session. */
export async function createChildAgentSession(
  options: CreateChildAgentSessionOptions,
): Promise<CreateChildAgentSessionResult> {
  return createDelegatedSession({
    ...options,
    systemPrompt: options.agentDefinition.systemPrompt,
    model: options.model ?? options.agentDefinition.model,
    thinking: options.thinking ?? options.agentDefinition.thinking,
    tools: options.tools ?? options.agentDefinition.tools,
    resolveExtensions: resolveChildExtensionFactories,
    ...createSessionRelationshipHooks(options),
  });
}
