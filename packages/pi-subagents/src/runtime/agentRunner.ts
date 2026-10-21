import { type AgentRunHandle, startDelegatedRun } from "../delegation";
import { type CreateChildAgentSessionOptions, createChildAgentSession } from "./sessionFactory";
import { type ParentSessionWriter, createSessionRelationshipHooks } from "./sessionRelationship";

export type { AgentRunHandle } from "../delegation";
/** Legacy input retained for raw-session SDK consumers. */
export interface StartAgentRunOptions extends CreateChildAgentSessionOptions {
  prompt: string;
  maxTurns?: number;
  timeoutMs?: number;
  parentSessionWriter?: ParentSessionWriter;
  parentToolCallId?: string;
}
/** @deprecated Use the neutral delegation boundary for new integrations. */
export async function startAgentRun(options: StartAgentRunOptions): Promise<AgentRunHandle> {
  return startDelegatedRun(
    {
      ...options,
      systemPrompt: options.agentDefinition.systemPrompt,
      ...createSessionRelationshipHooks(options),
    },
    () => createChildAgentSession(options),
  );
}
