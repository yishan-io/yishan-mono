import { type DshDelegationLifecycleState, recoverDshDelegationLifecycle } from "../chat/agentChatDshDelegation";
import type { DSHEvent } from "./dshTranscript";

/** Store mutations that publish recovered DSH delegation lifecycle state. */
export type DSHDelegationLifecycleActions = {
  setDshDelegationLifecycle(tabId: string, lifecycle: DshDelegationLifecycleState): void;
  replaceDshDelegationLifecycle(
    tabId: string,
    lifecycleByChildSessionId: Record<string, DshDelegationLifecycleState>,
  ): void;
};

/** Projects delegation lifecycle settlements from the current DSH transcript. */
export function projectLifecycle(
  actions: DSHDelegationLifecycleActions,
  tabId: string,
  events: readonly DSHEvent[],
  shouldReplace: boolean,
): void {
  const lifecycleByChildSessionId = recoverDshDelegationLifecycle(events);
  if (shouldReplace) {
    actions.replaceDshDelegationLifecycle(tabId, lifecycleByChildSessionId);
    return;
  }
  for (const lifecycle of Object.values(lifecycleByChildSessionId)) {
    actions.setDshDelegationLifecycle(tabId, lifecycle);
  }
}
