import type { ParsedAgentInvocation } from "./invocationParser";

const SINGLE_AGENT_INSTRUCTION =
  "Use the Agent tool to delegate the task below to the named sub-agent. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Wait for the sub-agent result, continue the work yourself, and then give the final response to the user.";
const MULTI_AGENT_INSTRUCTION =
  "Use the Agent tool to delegate the task below to the listed sub-agents. Call the Agent tool immediately without any preamble, explanation, or user-facing planning text. Run them in parallel when helpful, wait for their results, continue the work yourself, and then give the final response to the user.";

/**
 * Builds the transformed main-agent prompt used for direct `@agent:` shorthand.
 */
export function buildDelegationPrompt(invocation: ParsedAgentInvocation): string {
  if (invocation.agents.length === 1) {
    const agentName = invocation.agents[0] ?? "";
    return `${SINGLE_AGENT_INSTRUCTION}

Sub-agent: ${agentName}

Task:
${invocation.prompt}`;
  }

  const agentList = invocation.agents.map((agentName) => `- ${agentName}`).join("\n");
  return `${MULTI_AGENT_INSTRUCTION}

Sub-agents:
${agentList}

Task:
${invocation.prompt}`;
}
