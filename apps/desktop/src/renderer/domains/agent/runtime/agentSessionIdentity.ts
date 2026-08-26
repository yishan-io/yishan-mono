import type { AgentRuntime } from "../daemon/daemonAgentTypes";

/** Builds the canonical identity key for one runtime-scoped agent session. */
export function buildAgentRuntimeSessionKey(runtime: AgentRuntime, sessionId: string): string {
  return JSON.stringify([runtime, sessionId]);
}
