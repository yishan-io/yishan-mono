import type { AgentCapabilities, AgentRuntime } from "../daemon/daemonAgentTypes";

/** Selects the daemon-ready runtime for a newly created top-level agent tab. */
export function selectNewAgentChatRuntime(capabilities: AgentCapabilities): AgentRuntime {
  return capabilities.dsh.configured && capabilities.dsh.ready ? "dsh" : "pi";
}

/** Normalizes persisted and explicit agent-chat runtime identity. */
export function normalizeAgentChatRuntime(input: { runtime?: AgentRuntime; sessionId?: string }): AgentRuntime {
  return input.runtime ?? "pi";
}
