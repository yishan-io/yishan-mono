import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { memo, useCallback, useEffect, useMemo } from "react";
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
import { RichComposer } from "../../components/RichComposer";
import { AgentMessageList } from "../../components/agent/AgentMessageList";
import { AgentModelSelector } from "../../components/agent/AgentModelSelector";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { getDaemonClient } from "../../rpc/rpcTransport";
import { agentChatStore } from "../../store/agentChatStore";
import type { AgentModel } from "../../store/agentChatTypes";
import { useAgentChatSlashCommands } from "./useAgentChatSlashCommands";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

type AgentChatViewProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  piSessionId?: string;
};

function AgentChatViewComponent({ tabId, workspaceId, cwd, piSessionId }: AgentChatViewProps) {
  const session = agentChatStore((s) => s.sessionsByTabId[tabId]);
  const slashCommands = useAgentChatSlashCommands();

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
      if (!sid || !value.trim()) return;
      await sendAgentPrompt({ tabId, sessionId: sid, message: value.trim() });
    },
    [session?.sessionId, tabId],
  );

  const handleAbort = useCallback(async () => {
    const sid = session?.sessionId;
    if (!sid) return;
    await abortAgent({ tabId, sessionId: sid });
  }, [session?.sessionId, tabId]);

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
        messages={finalizedMessages}
        trailingMessage={trailingMessage}
        emptyPrompt="Send a message to start the conversation."
        workspacePath={cwd}
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
          {session.state === "running" && (
            <Button
              variant="text"
              size="small"
              color="error"
              onClick={handleAbort}
              sx={{
                minWidth: 0,
                px: 0,
                py: 0,
                ml: session.availableModels.length > 0 ? 0 : 1,
                fontSize: 12,
                lineHeight: 1.5,
                textTransform: "none",
              }}
            >
              Stop
            </Button>
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
