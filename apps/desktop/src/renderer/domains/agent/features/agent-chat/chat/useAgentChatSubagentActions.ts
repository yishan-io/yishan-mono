import { useCallback } from "react";
import { fetchAgentMessages } from "../../../commands/agentChatCommands";
import { cancelSubagentRun, openSubagentSessionInRightSplitPane } from "../../../commands/agentChatSubagentCommands";
import { useAgentChatSubagentState } from "../../../hooks/useAgentChatReadHooks";
import { type RunningSubagentSummary, findMatchingRunningSubagent } from "../../../model/agentChatSubagents";
import { selectAgentChatSession } from "../../../state/agentChatSelectors";

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
  const { runningSubagents, subagentProgressTargets, subagentCancelStates } = useAgentChatSubagentState(tabId);
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
        const refreshedRunningSubagents = selectAgentChatSession(tabId)?.runningSubagents ?? [];
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
      // Prefer the row's real ids; a live run whose lifecycle entry has not
      // reached the store yet resolves its target from a unique progress-widget
      // match (the manager's real agentId). Nothing is silently dropped: rows
      // with no resolvable target surface an explicit failure in the command.
      let agentId = subagent.agentId;
      let childSessionId = subagent.childSessionId;
      if (!agentId && !childSessionId) {
        const matchingProgressTargets = subagentProgressTargets.filter(
          (target) => target.agentName === subagent.agentName,
        );
        if (matchingProgressTargets.length === 1) {
          agentId = matchingProgressTargets[0]?.agentId;
          childSessionId = matchingProgressTargets[0]?.childSessionId;
        }
      }
      await cancelSubagentRun({
        tabId,
        sessionId,
        rowKey: subagent.childSessionId ?? subagent.rowId,
        agentId,
        agentName: subagent.agentName,
        childSessionId,
      });
    },
    [sessionId, subagentProgressTargets, tabId],
  );

  return {
    runningSubagents,
    subagentProgressTargets,
    subagentCancelStates,
    handleOpenSubagent,
    handleCancelSubagent,
  };
}
