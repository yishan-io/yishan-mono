import { useEffect, useRef } from "react";
import {
  clearPiSessionHandle,
  ensurePiSession,
  fetchAgentMessages,
  fetchAgentModels,
  fetchAgentState,
  findTabWithSession,
  reattachPiSession,
  refreshAgentSessionStats,
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
        if (isDisposed) return;
        await refreshAgentSessionStats(startedSessionId);
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

          // Subagent-detail tabs are read-only: they never own a daemon session
          // to reattach, and their transcript is re-streamed by the parent's
          // events, so there is nothing to recover here.
          if (isReadOnlySubagentDetail) {
            return;
          }

          // fire-and-forget: the connection-status subscription cannot await recovery.
          void (async () => {
            try {
              await reattachPiSession(tabId);
              await fetchAgentState({ tabId, sessionId: liveSessionId });
              await fetchAgentMessages({ tabId, sessionId: liveSessionId });
              await fetchAgentModels({ tabId, sessionId: liveSessionId });
              await refreshAgentSessionStats(liveSessionId);
            } catch {
              // The daemon no longer holds the session (e.g. it was re-run and
              // started fresh). Drop the stale handle and re-start the session
              // so the tab heals itself instead of staying broken.
              clearPiSessionHandle(tabId);
              try {
                await ensurePiSession({
                  tabId,
                  workspaceId,
                  cwd,
                  sessionId: liveSessionId,
                  sessionView,
                  paneId: startupPaneIdRef.current,
                });
                await fetchAgentState({ tabId, sessionId: liveSessionId });
                await fetchAgentMessages({ tabId, sessionId: liveSessionId });
                await fetchAgentModels({ tabId, sessionId: liveSessionId });
                await refreshAgentSessionStats(liveSessionId);
              } catch (recoveryError) {
                agentChatStore.getState().setSessionError(tabId, getErrorMessage(recoveryError));
              }
            }
          })();
        }
      }
    });
  }, [cwd, isReadOnlySubagentDetail, sessionView, tabId, workspaceId]);
}
