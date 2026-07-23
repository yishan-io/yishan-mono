import { useEffect, useRef } from "react";
import {
  clearPiSessionHandle,
  ensurePiSession,
  fetchAgentMessages,
  fetchAgentModels,
  fetchAgentState,
  findTabWithSession,
  reattachPiSession,
} from "../../commands/agentChatCommands";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { subscribeDaemonConnectionStatus } from "../../rpc/rpcTransport";
import { agentChatStore } from "../../store/agentChatStore";
import type { AgentChatSessionView } from "../../store/types";

type UseAgentChatSessionLifecycleOptions = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView: AgentChatSessionView;
  paneId?: string;
  subagentParentSessionId?: string;
};

/** Initializes an agent session and restores its daemon connection after reconnects. */
export function useAgentChatSessionLifecycle({
  tabId,
  workspaceId,
  cwd,
  sessionId,
  sessionView,
  paneId,
  subagentParentSessionId,
}: UseAgentChatSessionLifecycleOptions): void {
  const startupPaneIdRef = useRef<string | undefined>(paneId);
  const startupSessionIdRef = useRef<string | undefined>(sessionId);
  const isReadOnlySubagentDetail = sessionView === "subagent-detail";

  useEffect(() => {
    let isDisposed = false;

    const initialize = async (): Promise<void> => {
      if (isReadOnlySubagentDetail) {
        const childSessionId = startupSessionIdRef.current ?? tabId;
        const parentTabId = subagentParentSessionId ? findTabWithSession(subagentParentSessionId) : undefined;
        const parentSession = parentTabId ? agentChatStore.getState().sessionsByTabId[parentTabId] : undefined;
        const initialMessages = parentSession?.subagentLiveTranscripts[childSessionId] ?? [];
        const isChildFinished = parentSession?.finishedSubagents.some(
          (subagent) => subagent.childSessionId === childSessionId,
        );
        const isParentTrackingChild =
          !isChildFinished &&
          Boolean(
            parentSession?.subagentLiveTranscripts[childSessionId] ||
              parentSession?.subagentProgressTargets.some((target) => target.childSessionId === childSessionId),
          );

        if (isParentTrackingChild) {
          agentChatStore.getState().initSession(tabId, childSessionId);
          agentChatStore.getState().replaceMessages(tabId, initialMessages);
          agentChatStore.getState().setAvailableModels(tabId, []);
          agentChatStore.getState().markStateLoaded(tabId);
          return;
        }
      }

      try {
        const startedSessionId = await ensurePiSession({
          tabId,
          workspaceId,
          cwd,
          sessionId: startupSessionIdRef.current,
          sessionView,
          paneId: startupPaneIdRef.current,
        });
        if (isDisposed) return;

        await fetchAgentState({ tabId, sessionId: startedSessionId });
        if (isDisposed) return;
        await fetchAgentMessages({ tabId, sessionId: startedSessionId });
        if (isDisposed) return;
        await fetchAgentModels({ tabId, sessionId: startedSessionId });
      } catch (error) {
        if (isDisposed) return;
        agentChatStore.getState().initSession(tabId, tabId);
        agentChatStore.getState().setSessionError(tabId, getErrorMessage(error));
      }
    };

    initialize();
    return () => {
      isDisposed = true;
    };
  }, [cwd, isReadOnlySubagentDetail, sessionView, subagentParentSessionId, tabId, workspaceId]);

  useEffect(() => {
    let hasObservedConnectedState = false;
    let shouldReattach = false;

    return subscribeDaemonConnectionStatus((status) => {
      if (status === "disconnected") {
        shouldReattach = true;
      } else if (status === "connected") {
        if (!hasObservedConnectedState) {
          hasObservedConnectedState = true;
        } else if (shouldReattach) {
          shouldReattach = false;
          const liveSessionId = agentChatStore.getState().sessionsByTabId[tabId]?.sessionId;
          if (!liveSessionId) return;

          // fire-and-forget: the connection-status subscription cannot await recovery.
          void (async () => {
            try {
              await reattachPiSession(tabId);
              await fetchAgentState({ tabId, sessionId: liveSessionId });
              await fetchAgentMessages({ tabId, sessionId: liveSessionId });
              await fetchAgentModels({ tabId, sessionId: liveSessionId });
            } catch {
              clearPiSessionHandle(tabId);
              agentChatStore
                .getState()
                .setSessionError(tabId, "Agent session disconnected. Reopen the tab to recover.");
            }
          })();
        }
      }
    });
  }, [tabId]);
}
