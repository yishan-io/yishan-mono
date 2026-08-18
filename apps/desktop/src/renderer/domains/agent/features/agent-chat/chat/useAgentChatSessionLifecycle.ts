import type { AgentChatSessionView } from "@renderer/domains/workbench";
import { useEffect, useRef } from "react";
import { subscribeDaemonConnectionStatus } from "../../../../../domains/session";
import { recoverAgentSessionAfterReconnect, startAgentChatSession } from "../../../commands/agentChatCommands";
import { selectAgentChatSession } from "../../../state/agentChatSelectors";

type UseAgentChatSessionLifecycleOptions = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView: AgentChatSessionView;
  paneId?: string;
  subagentParentSessionId?: string;
};

/**
 * Initializes an agent session and restores its daemon connection after
 * reconnects. React binding only — the session start and recovery races live
 * in AgentSessionRuntime via the AgentChatCommands surface.
 */
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

    void startAgentChatSession({
      tabId,
      workspaceId,
      cwd,
      sessionId: startupSessionIdRef.current,
      sessionView,
      paneId: startupPaneIdRef.current,
      subagentParentSessionId,
    }).then(() => {
      if (isDisposed) {
        return;
      }
    });

    return () => {
      isDisposed = true;
    };
  }, [cwd, sessionView, subagentParentSessionId, tabId, workspaceId]);

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
          const liveSessionId = selectAgentChatSession(tabId)?.sessionId;
          if (!liveSessionId) return;

          // Subagent-detail tabs are read-only: they never own a daemon session
          // to reattach, and their transcript is re-streamed by the parent's
          // events, so there is nothing to recover here.
          if (isReadOnlySubagentDetail) {
            return;
          }

          // fire-and-forget: the connection-status subscription cannot await recovery.
          void recoverAgentSessionAfterReconnect({
            tabId,
            workspaceId,
            cwd,
            sessionId: liveSessionId,
            sessionView,
            paneId: startupPaneIdRef.current,
          });
        }
      }
    });
  }, [cwd, isReadOnlySubagentDetail, sessionView, tabId, workspaceId]);
}
