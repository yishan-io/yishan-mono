import type { ParsedAgentInvocation } from "./invocationParser";

const IMMEDIATE_DELEGATION_INSTRUCTION =
  "Call the Agent tool immediately without any preamble, explanation, or user-facing planning text.";
const NO_DUPLICATION_INSTRUCTION =
  "Once delegated, do not duplicate the same work yourself. Wait for the result or continue only with non-overlapping tasks.";
const SUBAGENT_PROMPT_INSTRUCTION =
  "In the Agent prompt, specify whether the sub-agent should do research or make code changes, point it to the most relevant files or directories, and tell it what result to return.";
const SINGLE_AGENT_INSTRUCTION = `Use the Agent tool to delegate the task below to the named sub-agent. ${IMMEDIATE_DELEGATION_INSTRUCTION} ${NO_DUPLICATION_INSTRUCTION} ${SUBAGENT_PROMPT_INSTRUCTION} Wait for the sub-agent result, continue the work yourself, and then give the final response to the user.`;
const MULTI_AGENT_INSTRUCTION = `Use the Agent tool to delegate the task below to the listed sub-agents. ${IMMEDIATE_DELEGATION_INSTRUCTION} If the workstreams are independent, run separate Agent calls in parallel. ${NO_DUPLICATION_INSTRUCTION} ${SUBAGENT_PROMPT_INSTRUCTION} Wait for the sub-agent results, continue the work yourself, and then give the final response to the user.`;

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
