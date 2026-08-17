import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { respondToAgentExtensionUiRequest } from "../../../features/agent/commands/agentChatCommands";
import { setAgentChatStreamTabVisible } from "../../../features/agent/events/agentChatPiEventShared";
import { agentChatStore } from "../../../features/agent/model/agentChatStore";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { tabStore } from "../../../features/workbench/state/tabStore";
import type { AgentChatSessionView } from "../../../features/workbench/model/types";
import { AgentChatComposerPane } from "./AgentChatComposerPane";
import { MemoizedAgentChatTranscriptPane } from "./AgentChatTranscriptPane";
import { AgentPendingUiPrompt } from "./AgentPendingUiPrompt";
import { AGENT_CHAT_TIP_KEYS, AGENT_CHAT_TIP_PREFIX_KEY } from "./agentChatTipCatalog";
import { useAgentChatSessionLifecycle } from "./useAgentChatSessionLifecycle";

type AgentChatViewProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView?: AgentChatSessionView;
  paneId?: string;
  isActive?: boolean;
};

function AgentChatViewComponent({
  tabId,
  workspaceId,
  cwd,
  sessionId,
  sessionView = "full",
  paneId,
  isActive = true,
}: AgentChatViewProps) {
  const { t } = useTranslation();
  const isReadOnlySubagentDetail = sessionView === "subagent-detail";
  const agentChatTab = tabStore((state) =>
    state.tabs.find((tab): tab is Extract<(typeof state.tabs)[number], { kind: "agent-chat" }> => {
      return tab.id === tabId && tab.kind === "agent-chat";
    }),
  );
  const hasSession = agentChatStore((state) => Boolean(state.sessionsByTabId[tabId]));
  const sessionState = agentChatStore(
    (state) => state.sessionsByTabId[tabId]?.state ?? (hasSession ? "idle" : "starting"),
  );
  const messageCount = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages.length ?? 0);
  const hasLoadedMessages = agentChatStore((state) => state.sessionsByTabId[tabId]?.hasLoadedMessages ?? false);
  const hasLoadedModels = agentChatStore((state) => state.sessionsByTabId[tabId]?.hasLoadedModels ?? false);
  const hasLoadedState = agentChatStore((state) => state.sessionsByTabId[tabId]?.hasLoadedState ?? false);
  const error = agentChatStore((state) => state.sessionsByTabId[tabId]?.error ?? null);
  const turnError = agentChatStore((state) => state.sessionsByTabId[tabId]?.turnError ?? null);
  const pendingUiRequest = agentChatStore((state) => state.sessionsByTabId[tabId]?.pendingUiRequest ?? null);
  const pendingUiAutoResponse = agentChatStore((state) => state.sessionsByTabId[tabId]?.pendingUiAutoResponse ?? null);
  const liveSessionId = agentChatStore((state) => state.sessionsByTabId[tabId]?.sessionId ?? null);
  const subagentParentSessionId =
    agentChatTab?.data.sessionView === "subagent-detail" ? agentChatTab.data.subagentParentSessionId : undefined;
  const isInitialHistoryLoadPending =
    Boolean(sessionId) && (!hasSession || !hasLoadedMessages || !hasLoadedModels || !hasLoadedState);
  const isReadyForAutoFocus = hasLoadedMessages && hasLoadedModels && hasLoadedState;

  const emptyHelpLines = useMemo(() => AGENT_CHAT_TIP_KEYS.map((key) => t(key)), [t]);
  const emptyHelpPrefix = t(AGENT_CHAT_TIP_PREFIX_KEY);

  useAgentChatSessionLifecycle({
    tabId,
    workspaceId,
    cwd,
    sessionId,
    sessionView,
    paneId,
    subagentParentSessionId,
  });

  useEffect(() => {
    setAgentChatStreamTabVisible(tabId, isActive);
  }, [isActive, tabId]);

  const handlePendingUiCancel = useCallback(async () => {
    if (!liveSessionId || !pendingUiRequest) {
      return;
    }

    agentChatStore.getState().clearPendingUiAutoResponse(tabId);

    await respondToAgentExtensionUiRequest({
      tabId,
      sessionId: liveSessionId,
      requestId: pendingUiRequest.id,
      cancelled: true,
    });
  }, [liveSessionId, pendingUiRequest, tabId]);

  const handlePendingUiConfirm = useCallback(
    async (input: { value?: string; confirmed?: boolean }) => {
      if (!liveSessionId || !pendingUiRequest) {
        return;
      }

      await respondToAgentExtensionUiRequest({
        tabId,
        sessionId: liveSessionId,
        requestId: pendingUiRequest.id,
        value: input.value,
        confirmed: input.confirmed,
      });
    },
    [liveSessionId, pendingUiRequest, tabId],
  );

  const handlePendingUiSelectCustomResponse = useCallback(
    async (value: string) => {
      if (!liveSessionId || !pendingUiRequest || pendingUiRequest.method !== "select") {
        return;
      }

      agentChatStore.getState().setPendingUiAutoResponse(tabId, {
        sourceRequestId: pendingUiRequest.id,
        targetMethod: "input",
        value,
      });

      await respondToAgentExtensionUiRequest({
        tabId,
        sessionId: liveSessionId,
        requestId: pendingUiRequest.id,
        value: "__ask_user_freeform__",
      });
    },
    [liveSessionId, pendingUiRequest, tabId],
  );

  useEffect(() => {
    if (!liveSessionId || !pendingUiRequest || !pendingUiAutoResponse) {
      return;
    }

    if (pendingUiRequest.id === pendingUiAutoResponse.sourceRequestId) {
      return;
    }

    if (pendingUiRequest.method !== pendingUiAutoResponse.targetMethod) {
      agentChatStore.getState().clearPendingUiAutoResponse(tabId);
      return;
    }

    void (async () => {
      try {
        await respondToAgentExtensionUiRequest({
          tabId,
          sessionId: liveSessionId,
          requestId: pendingUiRequest.id,
          value: pendingUiAutoResponse.value,
        });
        agentChatStore.getState().clearPendingUiAutoResponse(tabId);
      } catch (error) {
        agentChatStore.getState().clearPendingUiAutoResponse(tabId);
        agentChatStore.getState().setTurnError(tabId, getErrorMessage(error));
      }
    })();
  }, [liveSessionId, pendingUiAutoResponse, pendingUiRequest, tabId]);

  if (isInitialHistoryLoadPending && sessionState !== "error") {
    return (
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!hasSession) {
    return (
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Typography
          sx={{
            color: "text.secondary",
          }}
        >
          Starting agent session…
        </Typography>
      </Box>
    );
  }

  if (sessionState === "error") {
    return (
      <Box
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 1,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: "error.main",
          }}
        >
          Failed to start agent session.
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            maxWidth: 400,
            textAlign: "center",
          }}
        >
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>
      <MemoizedAgentChatTranscriptPane
        tabId={tabId}
        workspaceId={workspaceId}
        cwd={cwd}
        paneId={paneId}
        isActive={isActive}
        isReadOnlySubagentDetail={isReadOnlySubagentDetail}
        parentSessionId={subagentParentSessionId}
        emptyHelpLines={isReadOnlySubagentDetail ? undefined : emptyHelpLines}
        emptyHelpPrefix={isReadOnlySubagentDetail ? undefined : emptyHelpPrefix}
      />
      {!isReadOnlySubagentDetail && pendingUiRequest ? (
        <AgentPendingUiPrompt
          request={pendingUiRequest}
          onCancel={handlePendingUiCancel}
          onConfirm={handlePendingUiConfirm}
          onSelectCustomResponse={handlePendingUiSelectCustomResponse}
        />
      ) : null}
      {turnError ? (
        <Box sx={{ px: 2, pb: 1 }}>
          <Alert severity="error" variant="outlined">
            {turnError}
          </Alert>
        </Box>
      ) : null}
      {!isReadOnlySubagentDetail ? (
        <AgentChatComposerPane
          tabId={tabId}
          workspaceId={workspaceId}
          cwd={cwd}
          paneId={paneId}
          isActive={isActive}
          isReadyForAutoFocus={isReadyForAutoFocus}
        />
      ) : null}
    </Box>
  );
}

const MemoizedAgentChatView = memo(AgentChatViewComponent);
MemoizedAgentChatView.displayName = "AgentChatView";

/** Full agent chat tab: transcript, composer, and model controls. */
export const AgentChatView = MemoizedAgentChatView;
