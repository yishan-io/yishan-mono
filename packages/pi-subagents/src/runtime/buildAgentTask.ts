import type { AgentDefinition, AgentTask } from "../agents/types";
import { resolveWorkspaceAccessFromTools } from "../agents/workspaceAccess";
import { buildChildSessionDescriptor } from "./sessionRelationship";

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
}): AgentTask {
  const tools = resolveAgentTools(input.agentDefinition);
  const workspaceAccess = resolveWorkspaceAccess(input.agentDefinition, tools);

  return {
    agentName: input.agentName,
    agentDefinition: input.agentDefinition,
    prompt: input.prompt,
    cwd: input.cwd,
    mode: input.mode,
    childSessionDescriptor: buildChildSessionDescriptor(input.agentName, input.prompt),
    tools,
    model: input.agentDefinition.model,
    thinking: input.agentDefinition.thinking,
    maxTurns: input.agentDefinition.maxTurns,
    timeoutMs: input.agentDefinition.timeoutMs,
    workspaceAccess,
  };
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
