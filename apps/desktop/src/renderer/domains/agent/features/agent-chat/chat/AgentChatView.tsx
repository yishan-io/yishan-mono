import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { tabStore } from "@renderer/domains/workbench";
import type { AgentChatSessionView } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { respondToAgentExtensionUiRequest, retryDSHTranscript } from "../../../commands/agentChatCommands";
import type { AgentRuntime } from "../../../daemon/daemonAgentTypes";
import { setAgentChatStreamTabVisible } from "../../../subscriptions/agentChatPiEventShared";

import { AgentChatComposerPane } from "./AgentChatComposerPane";
import { AgentChatContentLayout } from "./AgentChatContentLayout";
import { MemoizedAgentChatTranscriptPane } from "./AgentChatTranscriptPane";
import { AgentPendingUiPrompt } from "./AgentPendingUiPrompt";
import { AGENT_CHAT_TIP_KEYS, AGENT_CHAT_TIP_PREFIX_KEY } from "./agentChatTipCatalog";
import { useAgentChatSessionLifecycle } from "./useAgentChatSessionLifecycle";

type AgentChatViewProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  runtime?: AgentRuntime;
  sessionView?: AgentChatSessionView;
  paneId?: string;
  isActive?: boolean;
};

function AgentChatViewComponent({
  tabId,
  workspaceId,
  cwd,
  sessionId,
  runtime,
  sessionView = "full",
  paneId,
  isActive = true,
}: AgentChatViewProps) {
  const { t } = useTranslation();
  const isReadOnlySubagentDetail = sessionView === "subagent-detail";
  const [isRetryingDSHTranscript, setIsRetryingDSHTranscript] = useState(false);
  const foundTab = tabStore((state) => state.tabs.find((tab) => tab.id === tabId));
  const agentChatTab = foundTab?.kind === "agent-chat" ? foundTab : undefined;
  const session = agentChatStore((state) => state.sessionsByTabId[tabId]);
  const hasSession = Boolean(session);
  const sessionState = session?.state ?? (hasSession ? "idle" : "starting");
  const messageCount = session?.messages.length ?? 0;
  const hasLoadedMessages = session?.hasLoadedMessages ?? false;
  const hasLoadedModels = session?.hasLoadedModels ?? false;
  const hasLoadedState = session?.hasLoadedState ?? false;
  const error = session?.error ?? null;
  const dshTranscriptRetryAvailable = session?.dshTranscriptRetryAvailable ?? false;
  const turnError = session?.turnError ?? null;
  const pendingUiRequest = session?.pendingUiRequest ?? null;
  const pendingUiAutoResponse = session?.pendingUiAutoResponse ?? null;
  const liveSessionId = session?.sessionId ?? null;
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
    runtime,
    sessionView,
    paneId,
    subagentParentSessionId,
  });

  useEffect(() => {
    setAgentChatStreamTabVisible(tabId, isActive);
  }, [isActive, tabId]);

  const handleRetryDSHTranscript = useCallback(async () => {
    setIsRetryingDSHTranscript(true);
    try {
      await retryDSHTranscript(tabId);
    } catch (error) {
      agentChatStore.getState().setSessionError(tabId, getErrorMessage(error));
    } finally {
      setIsRetryingDSHTranscript(false);
    }
  }, [tabId]);

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
      <AgentChatContentLayout>
        <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <CircularProgress size={24} />
        </Box>
      </AgentChatContentLayout>
    );
  }

  if (!hasSession) {
    return (
      <AgentChatContentLayout>
        <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <Typography
            sx={{
              color: "text.secondary",
            }}
          >
            Starting agent session…
          </Typography>
        </Box>
      </AgentChatContentLayout>
    );
  }

  if (sessionState === "error" || isRetryingDSHTranscript) {
    return (
      <AgentChatContentLayout>
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
          {runtime === "dsh" && dshTranscriptRetryAvailable ? (
            <Button
              variant="outlined"
              onClick={handleRetryDSHTranscript}
              disabled={isRetryingDSHTranscript}
              startIcon={isRetryingDSHTranscript ? <CircularProgress size={16} /> : undefined}
            >
              {isRetryingDSHTranscript ? "Retrying DSH transcript…" : "Retry DSH transcript"}
            </Button>
          ) : null}
        </Box>
      </AgentChatContentLayout>
    );
  }

  return (
    <AgentChatContentLayout>
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
      {turnError ? (
        <Box sx={{ px: 2, pb: 1 }}>
          <Alert severity="error" variant="outlined">
            {turnError}
          </Alert>
        </Box>
      ) : null}
      {!isReadOnlySubagentDetail ? (
        pendingUiRequest ? (
          <AgentPendingUiPrompt
            request={pendingUiRequest}
            onCancel={handlePendingUiCancel}
            onConfirm={handlePendingUiConfirm}
            onSelectCustomResponse={handlePendingUiSelectCustomResponse}
          />
        ) : (
          <AgentChatComposerPane
            tabId={tabId}
            workspaceId={workspaceId}
            cwd={cwd}
            paneId={paneId}
            isActive={isActive}
            isReadyForAutoFocus={isReadyForAutoFocus}
          />
        )
      ) : null}
    </AgentChatContentLayout>
  );
}

const MemoizedAgentChatView = memo(AgentChatViewComponent);
MemoizedAgentChatView.displayName = "AgentChatView";

/** Full agent chat tab: transcript, composer, and model controls. */
export const AgentChatView = MemoizedAgentChatView;

import { agentChatStore } from "../../../state/agentChatStore";
