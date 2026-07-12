import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
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
import type { AgentModel } from "../../store/agentChatTypes";
import { tabStore } from "../../store/tabStore";
import { transformAgentChatPromptForSkills } from "./agentChatSkillPromptTransform";
import { useAgentChatSlashCommands } from "./useAgentChatSlashCommands";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

type AgentChatViewProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  piSessionId?: string;
  isActive?: boolean;
};

function AgentChatViewComponent({ tabId, workspaceId, cwd, piSessionId, isActive = true }: AgentChatViewProps) {
  const session = agentChatStore((s) => s.sessionsByTabId[tabId]);
  const agentChatTab = tabStore((state) =>
    state.tabs.find((tab): tab is Extract<(typeof state.tabs)[number], { kind: "agent-chat" }> => {
      return tab.id === tabId && tab.kind === "agent-chat";
    }),
  );
  const slashCommands = useAgentChatSlashCommands();
  const [draft, setDraft] = useState("");

  // Start Pi session at tab level (survives Strict Mode remounts).
  useEffect(() => {
    let isDisposed = false;

    const initialize = async (): Promise<void> => {
      try {
        const startedSessionId = await ensurePiSession({ tabId, workspaceId, cwd, piSessionId });
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

        // Restore session state and message history.
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
      // Pi session outlives the component — stopped when tab closes.
    };
  }, [tabId, workspaceId, cwd, piSessionId]);

  const finalizedMessages = useMemo(() => session?.messages ?? [], [session?.messages]);
  const trailingMessage = session?.streamingMessage ?? null;

  const handleSubmit = useCallback(
    async (value: string) => {
      const sid = session?.sessionId;
      const prompt = value.trim();
      if (!sid || !prompt) return;

      if (session.messages.length === 0 && !session.streamingMessage && !agentChatTab?.data.userRenamed) {
        renameTab(tabId, formatAgentSessionTitle(prompt));
      }

      const nextMessage = await transformAgentChatPromptForSkills(prompt, slashCommands);
      await sendAgentPrompt({ tabId, sessionId: sid, message: nextMessage });
    },
    [
      agentChatTab?.data.userRenamed,
      session?.messages.length,
      session?.sessionId,
      session?.streamingMessage,
      slashCommands,
      tabId,
    ],
  );

  const handleAbort = useCallback(async () => {
    const sid = session?.sessionId;
    if (!sid) return;
    await abortAgent({ tabId, sessionId: sid });
  }, [session?.sessionId, tabId]);

  const handleSubmitButtonClick = useCallback(async () => {
    const nextDraft = draft.trim();
    if (!nextDraft) return;
    await handleSubmit(nextDraft);
    setDraft("");
  }, [draft, handleSubmit]);

  const handleModelChange = useCallback(
    async (model: AgentModel) => {
      const sid = session?.sessionId;
      if (!sid) return;
      const [provider, ...rest] = model.id.split("/");
      const modelId = rest.length > 0 ? rest.join("/") : model.id;
      agentChatStore.getState().setCurrentModel(tabId, model);
      await setAgentModel({ tabId, sessionId: sid, provider: provider || "", modelId });
    },
    [session?.sessionId, tabId],
  );

  const handleThinkingCycle = useCallback(async () => {
    const sid = session?.sessionId;
    if (!sid) return;
    const currentIdx = THINKING_LEVELS.indexOf(session.thinkingLevel);
    const nextLevel = THINKING_LEVELS[(currentIdx + 1) % THINKING_LEVELS.length] ?? THINKING_LEVELS[0] ?? "medium";
    await setAgentThinkingLevel({ tabId, sessionId: sid, level: nextLevel });
  }, [session?.sessionId, session?.thinkingLevel, tabId]);

  if (!session) {
    return (
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Typography color="text.secondary">Starting agent session…</Typography>
      </Box>
    );
  }

  // Show a loading spinner while fetching the transcript for a resumed session.
  if (piSessionId && session.messages.length === 0 && session.state !== "error") {
    return (
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (session.state === "error") {
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
          {session.error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Messages */}
      <AgentMessageList
        tabId={tabId}
        isActive={isActive}
        messages={finalizedMessages}
        trailingMessage={trailingMessage}
        emptyPrompt="Send a message to start the conversation."
        workspacePath={cwd}
        isWorking={session.state === "running"}
      />

      {/* Composer + controls */}
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
          disabled={session.state === "starting"}
          slashCommands={slashCommands}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, minHeight: 18 }}>
          {session.availableModels.length > 0 && (
            <AgentModelSelector
              models={session.availableModels}
              currentModel={session.currentModel}
              thinkingLevel={session.thinkingLevel}
              onModelChange={handleModelChange}
              onThinkingLevelCycle={handleThinkingCycle}
            />
          )}
          <Box sx={{ flex: 1 }} />
          {session.state === "running" ? (
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
                  disabled={session.state === "starting" || draft.trim().length === 0}
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
    </Box>
  );
}

const MemoizedAgentChatView = memo(AgentChatViewComponent);
MemoizedAgentChatView.displayName = "AgentChatView";

/** Full agent chat tab: session bar, message list, composer, model selector. */
export const AgentChatView = MemoizedAgentChatView;
