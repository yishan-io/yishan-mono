import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";

import type { AgentDefinition, AgentTask } from "../agents/types";
import { resolveWorkspaceAccessFromTools } from "../agents/workspaceAccess";
import type { AgentTask as DelegationTask } from "../delegation";
import { resolveChildExtensionFactories } from "./childExtensions";
import { buildChildSessionDescriptor, createSessionRelationshipHooks } from "./sessionRelationship";

/** Executable task with legacy adapter fields and resolved neutral configuration. */
export type ResolvedAgentTask = AgentTask & DelegationTask;

const DEFAULT_READ_ONLY_TOOL_NAMES = ["read", "grep", "find", "ls"];

/**
 * Builds one executable manager task from a resolved agent definition.
 */
export function buildAgentTask(input: {
  agentName: string;
  agentDefinition: AgentDefinition;
  prompt: string;
  cwd: string;
  mode: AgentTask["mode"];
  parentModel?: Model<Api>;
  parentThinking?: ThinkingLevel;
}): ResolvedAgentTask {
  const tools = resolveAgentTools(input.agentDefinition);
  const workspaceAccess = resolveWorkspaceAccess(input.agentDefinition, tools);

  const task: ResolvedAgentTask = {
    agentName: input.agentName,
    agentDefinition: input.agentDefinition,
    systemPrompt: input.agentDefinition.systemPrompt,
    resolveExtensions: resolveChildExtensionFactories,
    prompt: input.prompt,
    cwd: input.cwd,
    mode: input.mode,
    childSessionDescriptor: buildChildSessionDescriptor(input.agentName, input.prompt),
    tools,
    model: input.agentDefinition.model,
    parentModel: input.parentModel,
    parentThinking: input.parentThinking,
    thinking: input.agentDefinition.thinking,
    maxTurns: input.agentDefinition.maxTurns,
    timeoutMs: input.agentDefinition.timeoutMs,
    workspaceAccess,
  };
  // Preserve the live parent binding assigned by tool/command adapters after construction.
  Object.defineProperties(task, Object.getOwnPropertyDescriptors(createSessionRelationshipHooks(task)));
  return task;
}

function resolveAgentTools(agentDefinition: AgentDefinition): string[] | undefined {
  if (agentDefinition.tools && agentDefinition.tools.length > 0) {
    return agentDefinition.tools;
  }

  if (agentDefinition.readOnly === false) {
    return undefined;
  }

  return [...DEFAULT_READ_ONLY_TOOL_NAMES];
}

function resolveWorkspaceAccess(
  agentDefinition: AgentDefinition,
  tools: string[] | undefined,
): AgentTask["workspaceAccess"] {
  if (tools && tools.length > 0) {
    return resolveWorkspaceAccessFromTools(tools);
  }

  if (agentDefinition.readOnly === false) {
    return "write";
  }

  return resolveWorkspaceAccessFromTools(tools);
}
