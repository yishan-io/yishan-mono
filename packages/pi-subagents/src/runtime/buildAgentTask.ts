import type { AgentDefinition, AgentTask } from "../agents/types";
import { buildChildSessionDescriptor } from "./sessionRelationship";

const DEFAULT_READ_ONLY_TOOL_NAMES = ["read", "grep", "find", "ls"];
const WRITE_TOOL_NAMES = new Set(["write", "edit"]);

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
  const readOnly = resolveAgentReadOnly(input.agentDefinition, tools);

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
    readOnly,
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

function resolveAgentReadOnly(agentDefinition: AgentDefinition, tools: string[] | undefined): boolean {
  if (agentDefinition.readOnly !== undefined) {
    return agentDefinition.readOnly;
  }

  if (!tools || tools.length === 0) {
    return false;
  }

  return !tools.some((toolName) => WRITE_TOOL_NAMES.has(toolName));
}
