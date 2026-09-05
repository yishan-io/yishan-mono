import { useMemo } from "react";
import {
  type DshDelegationLifecycleState,
  resolveDshDelegationDiagnostics,
  resolveDshDelegationStates,
} from "../../../../../domains/agent/chat/agentChatDshDelegation";
import { resolveAgentToolCallLifecycleStates } from "../../../../../domains/agent/chat/agentChatSubagents";
import type { AgentMessage } from "../../../../../domains/agent/chat/agentChatTypes";

/** Derives tool-call state maps used by transcript turn rows. */
export function useAgentMessageDelegations(
  messages: AgentMessage[],
  trailingMessage: AgentMessage | null,
  lifecycleByChildSessionId: Readonly<Record<string, DshDelegationLifecycleState>> | undefined,
) {
  const agentToolCallStates = useMemo(
    () => resolveAgentToolCallLifecycleStates(messages, trailingMessage),
    [messages, trailingMessage],
  );
  const dshDelegationLifecycle = useMemo(
    () => new Map(Object.entries(lifecycleByChildSessionId ?? {})),
    [lifecycleByChildSessionId],
  );
  const dshDelegationStates = useMemo(
    () => resolveDshDelegationStates(messages, dshDelegationLifecycle),
    [dshDelegationLifecycle, messages],
  );
  const dshDelegationDiagnostics = useMemo(
    () => resolveDshDelegationDiagnostics(messages, dshDelegationLifecycle),
    [dshDelegationLifecycle, messages],
  );
  return { agentToolCallStates, dshDelegationStates, dshDelegationDiagnostics };
}
