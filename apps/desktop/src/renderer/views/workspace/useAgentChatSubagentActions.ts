import { useCallback } from "react";
import { fetchAgentMessages } from "../../commands/agentChatCommands";
import { cancelSubagentRun, openSubagentSessionInRightSplitPane } from "../../commands/agentChatSubagentCommands";
import { agentChatStore } from "../../store/agentChatStore";
import { type RunningSubagentSummary, findMatchingRunningSubagent } from "../../store/agentChatSubagents";

type UseAgentChatSubagentActionsOptions = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  sessionId: string | null;
};

/** Provides subagent rows plus their open and cancellation command handlers. */
export function useAgentChatSubagentActions({
  tabId,
  workspaceId,
  cwd,
  paneId,
  sessionId,
}: UseAgentChatSubagentActionsOptions) {
  const runningSubagents = agentChatStore((state) => state.sessionsByTabId[tabId]?.runningSubagents ?? []);
  const subagentProgressTargets = agentChatStore(
    (state) => state.sessionsByTabId[tabId]?.subagentProgressTargets ?? [],
  );
  const handleOpenSubagent = useCallback(
    async (subagent: RunningSubagentSummary) => {
      console.debug("[AgentChatView] subagent open requested", {
        tabId,
        sessionId,
        paneId,
        subagent,
        subagentProgressTargets,
      });
      let childSessionId = subagent.childSessionId;
      let title = subagent.title;
      if (!childSessionId && sessionId) {
        await fetchAgentMessages({ tabId, sessionId });
        const refreshedRunningSubagents = agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents ?? [];
        const refreshedSubagent = findMatchingRunningSubagent(refreshedRunningSubagents, subagent);
        childSessionId = refreshedSubagent?.childSessionId;
        title = refreshedSubagent?.title ?? title;
        console.debug("[AgentChatView] subagent open transcript refresh resolved", {
          tabId,
          refreshedRunningSubagents,
          refreshedSubagent,
          childSessionId,
        });
      }
      if (!childSessionId) {
        const matchingProgressTargets = subagentProgressTargets.filter(
          (target) => target.agentName === subagent.agentName,
        );
        if (matchingProgressTargets.length === 1) childSessionId = matchingProgressTargets[0]?.childSessionId;
        console.debug("[AgentChatView] subagent open progress target resolved", {
          tabId,
          matchingProgressTargets,
          childSessionId,
        });
      }
      if (!childSessionId) {
        console.debug("[AgentChatView] subagent open skipped: unresolved child session", {
          tabId,
          subagent,
          subagentProgressTargets,
        });
        return;
      }
      console.debug("[AgentChatView] subagent open dispatching", {
        tabId,
        workspaceId,
        paneId,
        sessionId,
        agentId: subagent.agentId,
        childSessionId,
        title,
      });
      await openSubagentSessionInRightSplitPane({
        workspaceId,
        cwd,
        parentPaneId: paneId,
        parentSessionId: sessionId ?? undefined,
        agentId: subagent.agentId,
        childSessionId,
        title,
      });
    },
    [cwd, paneId, sessionId, subagentProgressTargets, tabId, workspaceId],
  );
  const handleCancelSubagent = useCallback(
    async (subagent: RunningSubagentSummary) => {
      if (!sessionId) return;
      let agentId = subagent.agentId;
      let childSessionId = subagent.childSessionId;
      if (!agentId && !childSessionId) {
        await fetchAgentMessages({ tabId, sessionId });
        const refreshedRunningSubagents = agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents ?? [];
        const refreshedSubagent = findMatchingRunningSubagent(refreshedRunningSubagents, subagent);
        agentId = refreshedSubagent?.agentId;
        childSessionId = refreshedSubagent?.childSessionId;
      }
      if (!agentId && !childSessionId) {
        const matchingProgressTargets = subagentProgressTargets.filter(
          (target) => target.agentName === subagent.agentName,
        );
        if (matchingProgressTargets.length === 1) agentId = matchingProgressTargets[0]?.agentId;
      }
      if (!agentId && !childSessionId) return;
      await cancelSubagentRun({ tabId, sessionId, agentId, agentName: subagent.agentName, childSessionId });
    },
    [sessionId, subagentProgressTargets, tabId],
  );
  return { runningSubagents, subagentProgressTargets, handleOpenSubagent, handleCancelSubagent };
}
