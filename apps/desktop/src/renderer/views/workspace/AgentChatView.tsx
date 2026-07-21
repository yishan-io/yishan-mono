import { Alert, Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuArrowUp } from "react-icons/lu";
import {
  abortAgent,
  clearPiSessionHandle,
  ensurePiSession,
  fetchAgentMessages,
  fetchAgentModels,
  fetchAgentState,
  findTabWithSession,
  handleAgentPiEvent,
  reattachPiSession,
  registerAgentSession,
  respondToAgentExtensionUiRequest,
  sendAgentPrompt,
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
  setPiSessionUnsubscribe,
} from "../../commands/agentChatCommands";
import { cancelSubagentRun, openSubagentSessionInRightSplitPane } from "../../commands/agentChatSubagentCommands";
import { renameTab } from "../../commands/tabCommands";
import { AgentChatVoiceButton } from "../../components/AgentChatVoiceButton";
import { RichComposer } from "../../components/RichComposer";
import { AgentChatSubagentRow } from "../../components/agent/session/AgentChatSubagentRow";
import { AgentChatUsageSummaryLabel } from "../../components/agent/session/AgentChatUsageSummaryLabel";
import { AgentModelSelector } from "../../components/agent/session/AgentModelSelector";
import { AgentMessageList } from "../../components/agent/transcript/AgentMessageList";
import { formatAgentSessionTitle } from "../../helpers/agentSkillTextHelpers";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { getDaemonClient } from "../../rpc/rpcTransport";
import { subscribeDaemonConnectionStatus } from "../../rpc/rpcTransport";
import { agentChatStore } from "../../store/agentChatStore";
import { type RunningSubagentSummary, findMatchingRunningSubagent } from "../../store/agentChatSubagents";
import type { AgentMessage, AgentModel } from "../../store/agentChatTypes";
import { tabStore } from "../../store/tabStore";
import type { AgentChatSessionView } from "../../store/types";
import { AgentPendingUiPrompt } from "./AgentPendingUiPrompt";
import { transformAgentChatPromptForSkills } from "./agentChatSkillPromptTransform";
import { useAgentChatSlashCommands } from "./useAgentChatSlashCommands";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
const EMPTY_MESSAGES: AgentMessage[] = [];
const EMPTY_MODELS: AgentModel[] = [];

type AgentChatViewProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  sessionId?: string;
  sessionView?: AgentChatSessionView;
  paneId?: string;
  isActive?: boolean;
};

type AgentChatTranscriptPaneProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  isActive: boolean;
  isReadOnlySubagentDetail: boolean;
};

type AgentChatComposerPaneProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
};

function AgentChatTranscriptPane({
  tabId,
  workspaceId,
  cwd,
  paneId,
  isActive,
  isReadOnlySubagentDetail,
}: AgentChatTranscriptPaneProps) {
  const messages = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages ?? EMPTY_MESSAGES);
  const trailingMessage = agentChatStore((state) => state.sessionsByTabId[tabId]?.streamingMessage ?? null);
  const sessionState = agentChatStore((state) => state.sessionsByTabId[tabId]?.state ?? "starting");
  const sessionId = agentChatStore((state) => state.sessionsByTabId[tabId]?.sessionId);
  const currentModel = agentChatStore((state) => state.sessionsByTabId[tabId]?.currentModel ?? null);
  const latestUsage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const usage = messages[index]?.usage;
      if (usage) return usage;
    }
    return null;
  }, [messages]);
  const handleOpenCompletedSubagent = useCallback(
    async (target: { agentId?: string; childSessionId: string; title: string }) => {
      await openSubagentSessionInRightSplitPane({
        workspaceId,
        cwd,
        parentPaneId: paneId,
        parentSessionId: sessionId,
        ...target,
      });
    },
    [cwd, paneId, sessionId, workspaceId],
  );

  return (
    <>
      <AgentMessageList
        tabId={tabId}
        isActive={isActive}
        messages={messages}
        trailingMessage={trailingMessage}
        emptyPrompt="Send a message to start the conversation."
        workspacePath={cwd}
        isWorking={sessionState === "running"}
        onOpenCompletedSubagent={handleOpenCompletedSubagent}
      />
      {isReadOnlySubagentDetail ? <AgentChatSubagentDetailFooter model={currentModel} usage={latestUsage} /> : null}
    </>
  );
}

const MemoizedAgentChatTranscriptPane = memo(AgentChatTranscriptPane);
MemoizedAgentChatTranscriptPane.displayName = "AgentChatTranscriptPane";

type AgentChatSubagentDetailFooterProps = {
  model: AgentModel | null;
  usage: AgentMessage["usage"] | null;
};

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return value.toLocaleString();
}

function AgentChatSubagentDetailFooter({ model, usage }: AgentChatSubagentDetailFooterProps) {
  const contextUsed = usage?.totalTokens ?? usage?.total;
  const contextLabel =
    typeof contextUsed === "number"
      ? `${formatCompactTokenCount(contextUsed)}${model?.contextWindow ? ` / ${formatCompactTokenCount(model.contextWindow)}` : ""} tokens`
      : "Context unavailable";
  const modelLabel = model ? `${model.provider ? `${model.provider} / ` : ""}${model.name}` : "Model unavailable";

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: "divider",
        px: 2,
        py: 0.75,
        display: "flex",
        gap: 2,
        color: "text.secondary",
      }}
    >
      <Typography variant="caption">Model: {modelLabel}</Typography>
      <Typography variant="caption">Context: {contextLabel}</Typography>
    </Box>
  );
}

function AgentChatComposerPane({ tabId, workspaceId, cwd, paneId }: AgentChatComposerPaneProps) {
  const slashCommands = useAgentChatSlashCommands();
  const agentChatTab = tabStore((state) =>
    state.tabs.find((tab): tab is Extract<(typeof state.tabs)[number], { kind: "agent-chat" }> => {
      return tab.id === tabId && tab.kind === "agent-chat";
    }),
  );
  const sessionId = agentChatStore((state) => state.sessionsByTabId[tabId]?.sessionId ?? null);
  const sessionState = agentChatStore((state) => state.sessionsByTabId[tabId]?.state ?? "starting");
  const availableModels = agentChatStore((state) => state.sessionsByTabId[tabId]?.availableModels ?? EMPTY_MODELS);
  const currentModel = agentChatStore((state) => state.sessionsByTabId[tabId]?.currentModel ?? null);
  const thinkingLevel = agentChatStore((state) => state.sessionsByTabId[tabId]?.thinkingLevel ?? "medium");
  const messageCount = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages.length ?? 0);
  const hasStreamingMessage = agentChatStore((state) => Boolean(state.sessionsByTabId[tabId]?.streamingMessage));
  const runningSubagents = agentChatStore((state) => state.sessionsByTabId[tabId]?.runningSubagents ?? []);
  const subagentProgressTargets = agentChatStore(
    (state) => state.sessionsByTabId[tabId]?.subagentProgressTargets ?? [],
  );
  const [draft, setDraft] = useState("");

  const handleSubmit = useCallback(
    async (value: string) => {
      const prompt = value.trim();
      if (!sessionId || !prompt) return;

      if (messageCount === 0 && !hasStreamingMessage && !agentChatTab?.data.userRenamed) {
        renameTab(tabId, formatAgentSessionTitle(prompt));
      }

      const nextMessage = await transformAgentChatPromptForSkills(prompt, slashCommands);
      await sendAgentPrompt({ tabId, sessionId, message: nextMessage });
    },
    [agentChatTab?.data.userRenamed, hasStreamingMessage, messageCount, sessionId, slashCommands, tabId],
  );

  const handleAbort = useCallback(async () => {
    if (!sessionId) return;
    await abortAgent({ tabId, sessionId });
  }, [sessionId, tabId]);

  const handleSubmitButtonClick = useCallback(async () => {
    const nextDraft = draft.trim();
    if (!nextDraft) return;
    await handleSubmit(nextDraft);
    setDraft("");
  }, [draft, handleSubmit]);

  const handleVoiceText = useCallback((text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }

    setDraft((currentDraft) => {
      const separator =
        currentDraft.length === 0 || currentDraft.endsWith(" ") || currentDraft.endsWith("\n") ? "" : " ";
      return `${currentDraft}${separator}${normalizedText}`;
    });
  }, []);

  const handleModelChange = useCallback(
    async (model: AgentModel) => {
      if (!sessionId) return;
      await setAgentModel({ tabId, sessionId, provider: model.provider ?? "", modelId: model.id });
    },
    [sessionId, tabId],
  );

  const handleThinkingCycle = useCallback(async () => {
    if (!sessionId) return;
    const currentIdx = THINKING_LEVELS.indexOf(thinkingLevel);
    const nextLevel = THINKING_LEVELS[(currentIdx + 1) % THINKING_LEVELS.length] ?? THINKING_LEVELS[0] ?? "medium";
    await setAgentThinkingLevel({ tabId, sessionId, level: nextLevel });
  }, [sessionId, tabId, thinkingLevel]);

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
        if (matchingProgressTargets.length === 1) {
          childSessionId = matchingProgressTargets[0]?.childSessionId;
        }
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
    [workspaceId, cwd, paneId, sessionId, tabId, subagentProgressTargets],
  );

  const handleCancelSubagent = useCallback(
    async (subagent: RunningSubagentSummary) => {
      if (!sessionId) {
        return;
      }

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
        if (matchingProgressTargets.length === 1) {
          agentId = matchingProgressTargets[0]?.agentId;
        }
      }

      if (!agentId && !childSessionId) {
        return;
      }

      await cancelSubagentRun({
        tabId,
        sessionId,
        agentId,
        agentName: subagent.agentName,
        childSessionId,
      });
    },
    [sessionId, subagentProgressTargets, tabId],
  );

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: "divider",
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
      }}
    >
      {runningSubagents.length > 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
            px: 0.5,
            py: 0.25,
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ px: 0.5, fontWeight: 700 }}>
            Running sub-agents
          </Typography>
          {runningSubagents.map((subagent) => {
            const matchingProgressTargets = subagentProgressTargets.filter(
              (target) => target.agentName === subagent.agentName,
            );
            const canCancel = Boolean(
              subagent.agentId || subagent.childSessionId || matchingProgressTargets.length === 1,
            );

            return (
              <AgentChatSubagentRow
                key={subagent.rowId}
                subagent={subagent}
                isRunning
                canCancel={canCancel}
                onOpen={handleOpenSubagent}
                onCancel={handleCancelSubagent}
              />
            );
          })}
        </Box>
      ) : null}
      <RichComposer
        placeholder="Type a message…"
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        disabled={sessionState === "starting"}
        slashCommands={slashCommands}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 4, px: 1, minHeight: 18 }}>
        {availableModels.length > 0 && (
          <AgentModelSelector
            models={availableModels}
            currentModel={currentModel}
            thinkingLevel={thinkingLevel}
            onModelChange={handleModelChange}
            onThinkingLevelCycle={handleThinkingCycle}
          />
        )}
        <AgentChatUsageSummaryLabel tabId={tabId} />
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, overflow: "visible" }}>
          <AgentChatVoiceButton
            onText={handleVoiceText}
            disabled={sessionState === "starting"}
            disabledMessage="Voice input is not available while the agent session is starting."
          />
          {sessionState === "running" ? (
            <Tooltip title="Stop" placement="top">
              <span>
                <IconButton
                  size="small"
                  onClick={handleAbort}
                  aria-label="Stop"
                  sx={{
                    width: 34,
                    height: 34,
                    p: 0,
                    border: "1px solid",
                    borderColor: (theme) => (theme.palette.mode === "dark" ? "divider" : theme.palette.error.main),
                    bgcolor: (theme) => (theme.palette.mode === "dark" ? "background.paper" : theme.palette.error.main),
                    color: (theme) =>
                      theme.palette.mode === "dark" ? "text.secondary" : theme.palette.error.contrastText,
                    borderRadius: 999,
                    boxShadow: 1,
                    transition: "background-color 120ms ease, border-color 120ms ease",
                    "&:hover": {
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? "action.hover" : theme.palette.error.dark),
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: 0.5,
                      bgcolor: "currentColor",
                    }}
                  />
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title="Submit" placement="top">
              <span>
                <IconButton
                  size="small"
                  onClick={() => {
                    void handleSubmitButtonClick();
                  }}
                  disabled={sessionState === "starting" || draft.trim().length === 0}
                  aria-label="Submit"
                  sx={{
                    width: 34,
                    height: 34,
                    p: 0,
                    border: "1px solid",
                    borderColor: "primary.main",
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    borderRadius: 999,
                    boxShadow: 1,
                    transition: "background-color 120ms ease, border-color 120ms ease",
                    "&:hover": {
                      bgcolor: "primary.dark",
                    },
                    "&.Mui-disabled": {
                      borderColor: "action.disabledBackground",
                      bgcolor: "action.disabledBackground",
                      color: "action.disabled",
                      boxShadow: 0,
                    },
                  }}
                >
                  <LuArrowUp size={16} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
}

const MemoizedAgentChatComposerPane = memo(AgentChatComposerPane);
MemoizedAgentChatComposerPane.displayName = "AgentChatComposerPane";

function AgentChatViewComponent({
  tabId,
  workspaceId,
  cwd,
  sessionId,
  sessionView = "full",
  paneId,
  isActive = true,
}: AgentChatViewProps) {
  const startupPaneIdRef = useRef<string | undefined>(paneId);
  const startupSessionIdRef = useRef<string | undefined>(sessionId);
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
    Boolean(startupSessionIdRef.current) && (!hasSession || !hasLoadedMessages || !hasLoadedModels || !hasLoadedState);

  useEffect(() => {
    let isDisposed = false;

    // Pane identity matters only when the Pi session is first started. Do not
    // reinitialize the session when the tab later moves between split panes,
    // or we risk resetting local chat state while the backend session still
    // retains its original pane binding.

    const initialize = async (): Promise<void> => {
      if (isReadOnlySubagentDetail) {
        const childSessionId = startupSessionIdRef.current ?? tabId;
        const parentSessionId = subagentParentSessionId;
        const parentTabId = parentSessionId ? findTabWithSession(parentSessionId) : undefined;
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

        registerAgentSession({ tabId, sessionId: startedSessionId });

        const client = await getDaemonClient();
        if (isDisposed) return;

        const sub = client.events.frontendStream.subscribe(undefined, {
          onData: (event: { topic: string; payload: unknown }) => {
            if (event.topic !== "agent.pi.event") return;
            const payload = event.payload as {
              sessionId: string;
              tabId: string;
              workspaceId: string;
              event: Record<string, unknown>;
            };
            if (payload.tabId === tabId) {
              handleAgentPiEvent(payload);
            }
          },
        });
        setPiSessionUnsubscribe(tabId, sub.unsubscribe);

        await fetchAgentState({ tabId, sessionId: startedSessionId });
        if (isDisposed) return;

        await fetchAgentMessages({ tabId, sessionId: startedSessionId });
        if (isDisposed) return;

        await fetchAgentModels({ tabId, sessionId: startedSessionId });
      } catch (error) {
        if (isDisposed) return;
        const message = getErrorMessage(error);
        agentChatStore.getState().initSession(tabId, tabId);
        agentChatStore.getState().setSessionError(tabId, message);
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
        return;
      }

      if (status !== "connected") {
        return;
      }

      if (!hasObservedConnectedState) {
        hasObservedConnectedState = true;
        return;
      }

      if (!shouldReattach) {
        return;
      }

      shouldReattach = false;
      const liveSessionId = agentChatStore.getState().sessionsByTabId[tabId]?.sessionId;
      if (!liveSessionId) {
        return;
      }

      void (async () => {
        try {
          await reattachPiSession(tabId);
          await fetchAgentState({ tabId, sessionId: liveSessionId });
          await fetchAgentMessages({ tabId, sessionId: liveSessionId });
          await fetchAgentModels({ tabId, sessionId: liveSessionId });
        } catch {
          clearPiSessionHandle(tabId);
          agentChatStore.getState().setSessionError(tabId, "Agent session disconnected. Reopen the tab to recover.");
        }
      })();
    });
  }, [tabId]);

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
        <Typography color="text.secondary">Starting agent session…</Typography>
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
        <Typography color="error.main" variant="body2">
          Failed to start agent session.
        </Typography>
        <Typography color="text.secondary" variant="caption" sx={{ maxWidth: 400, textAlign: "center" }}>
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
        <MemoizedAgentChatComposerPane tabId={tabId} workspaceId={workspaceId} cwd={cwd} paneId={paneId} />
      ) : null}
    </Box>
  );
}

const MemoizedAgentChatView = memo(AgentChatViewComponent);
MemoizedAgentChatView.displayName = "AgentChatView";

/** Full agent chat tab: transcript, composer, and model controls. */
export const AgentChatView = MemoizedAgentChatView;
