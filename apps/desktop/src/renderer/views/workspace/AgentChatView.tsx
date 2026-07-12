import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { LuArrowUp } from "react-icons/lu";
import {
  abortAgent,
  ensurePiSession,
  fetchAgentMessages,
  fetchAgentModels,
  fetchAgentState,
  handleAgentPiEvent,
  registerAgentSession,
  sendAgentPrompt,
  setAgentChatStreamTabVisible,
  setAgentModel,
  setAgentThinkingLevel,
  setPiSessionUnsubscribe,
} from "../../commands/agentChatCommands";
import { renameTab } from "../../commands/tabCommands";
import { RichComposer } from "../../components/RichComposer";
import { AgentMessageList } from "../../components/agent/AgentMessageList";
import { AgentModelSelector } from "../../components/agent/AgentModelSelector";
import { formatAgentSessionTitle } from "../../helpers/agentSkillTextHelpers";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { getDaemonClient } from "../../rpc/rpcTransport";
import { agentChatStore } from "../../store/agentChatStore";
import type { AgentMessage, AgentModel, AgentSessionState } from "../../store/agentChatTypes";
import { tabStore } from "../../store/tabStore";
import { transformAgentChatPromptForSkills } from "./agentChatSkillPromptTransform";
import { useAgentChatSlashCommands } from "./useAgentChatSlashCommands";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
const EMPTY_MESSAGES: AgentMessage[] = [];
const EMPTY_MODELS: AgentModel[] = [];

type AgentChatViewProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  piSessionId?: string;
  paneId?: string;
  isActive?: boolean;
};

type AgentChatTranscriptPaneProps = {
  tabId: string;
  cwd: string;
  isActive: boolean;
};

type AgentChatComposerPaneProps = {
  tabId: string;
};

function AgentChatTranscriptPane({ tabId, cwd, isActive }: AgentChatTranscriptPaneProps) {
  const messages = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages ?? EMPTY_MESSAGES);
  const trailingMessage = agentChatStore((state) => state.sessionsByTabId[tabId]?.streamingMessage ?? null);
  const sessionState = agentChatStore((state) => state.sessionsByTabId[tabId]?.state ?? "starting");

  return (
    <AgentMessageList
      tabId={tabId}
      isActive={isActive}
      messages={messages}
      trailingMessage={trailingMessage}
      emptyPrompt="Send a message to start the conversation."
      workspacePath={cwd}
      isWorking={sessionState === "running"}
    />
  );
}

const MemoizedAgentChatTranscriptPane = memo(AgentChatTranscriptPane);
MemoizedAgentChatTranscriptPane.displayName = "AgentChatTranscriptPane";

function AgentChatComposerPane({ tabId }: AgentChatComposerPaneProps) {
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

  const handleModelChange = useCallback(
    async (model: AgentModel) => {
      if (!sessionId) return;
      const [provider, ...rest] = model.id.split("/");
      const modelId = rest.length > 0 ? rest.join("/") : model.id;
      agentChatStore.getState().setCurrentModel(tabId, model);
      await setAgentModel({ tabId, sessionId, provider: provider || "", modelId });
    },
    [sessionId, tabId],
  );

  const handleThinkingCycle = useCallback(async () => {
    if (!sessionId) return;
    const currentIdx = THINKING_LEVELS.indexOf(thinkingLevel);
    const nextLevel = THINKING_LEVELS[(currentIdx + 1) % THINKING_LEVELS.length] ?? THINKING_LEVELS[0] ?? "medium";
    await setAgentThinkingLevel({ tabId, sessionId, level: nextLevel });
  }, [sessionId, tabId, thinkingLevel]);

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
      <RichComposer
        placeholder="Type a message…"
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        disabled={sessionState === "starting"}
        slashCommands={slashCommands}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, minHeight: 18 }}>
        {availableModels.length > 0 && (
          <AgentModelSelector
            models={availableModels}
            currentModel={currentModel}
            thinkingLevel={thinkingLevel}
            onModelChange={handleModelChange}
            onThinkingLevelCycle={handleThinkingCycle}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {sessionState === "running" ? (
          <Tooltip title="Stop" placement="top">
            <span>
              <IconButton
                size="small"
                onClick={handleAbort}
                aria-label="Stop"
                sx={{
                  p: 0.5,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
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
                  p: 0.5,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                }}
              >
                <LuArrowUp size={16} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

const MemoizedAgentChatComposerPane = memo(AgentChatComposerPane);
MemoizedAgentChatComposerPane.displayName = "AgentChatComposerPane";

function AgentChatViewComponent({ tabId, workspaceId, cwd, piSessionId, paneId, isActive = true }: AgentChatViewProps) {
  const startupPaneIdRef = useRef<string | undefined>(paneId);
  const hasSession = agentChatStore((state) => Boolean(state.sessionsByTabId[tabId]));
  const sessionState = agentChatStore(
    (state) => state.sessionsByTabId[tabId]?.state ?? (hasSession ? "idle" : "starting"),
  );
  const messageCount = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages.length ?? 0);
  const error = agentChatStore((state) => state.sessionsByTabId[tabId]?.error ?? null);

  useEffect(() => {
    let isDisposed = false;

    // Pane identity matters only when the Pi session is first started. Do not
    // reinitialize the session when the tab later moves between split panes,
    // or we risk resetting local chat state while the backend session still
    // retains its original pane binding.

    const initialize = async (): Promise<void> => {
      try {
        const startedSessionId = await ensurePiSession({
          tabId,
          workspaceId,
          cwd,
          piSessionId,
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
  }, [tabId, workspaceId, cwd, piSessionId]);

  useEffect(() => {
    setAgentChatStreamTabVisible(tabId, isActive);
  }, [isActive, tabId]);

  if (!hasSession) {
    return (
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Typography color="text.secondary">Starting agent session…</Typography>
      </Box>
    );
  }

  if (piSessionId && messageCount === 0 && sessionState !== "error") {
    return (
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <CircularProgress size={24} />
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
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <MemoizedAgentChatTranscriptPane tabId={tabId} cwd={cwd} isActive={isActive} />
      <MemoizedAgentChatComposerPane tabId={tabId} />
    </Box>
  );
}

const MemoizedAgentChatView = memo(AgentChatViewComponent);
MemoizedAgentChatView.displayName = "AgentChatView";

/** Full agent chat tab: transcript, composer, and model controls. */
export const AgentChatView = MemoizedAgentChatView;
