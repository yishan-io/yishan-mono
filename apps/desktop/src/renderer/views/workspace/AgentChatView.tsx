import { Box, IconButton, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AgentMessage } from "../../components/AgentMessage";
import { AgentModelSelector } from "../../components/AgentModelSelector";
import { AgentSessionBar } from "../../components/AgentSessionBar";
import { RichComposer } from "../../components/RichComposer";
import { agentChatStore } from "../../store/agentChatStore";
import {
  handleAgentPiEvent,
  startAgentSession,
  stopAgentSession,
  sendAgentPrompt,
  abortAgent,
  setAgentModel,
  setAgentThinkingLevel,
  fetchAgentModels,
} from "../../commands/agentChatCommands";
import { getDaemonClient } from "../../rpc/rpcTransport";
import type { AgentModel } from "../../store/agentChatTypes";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

type AgentChatViewProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
};

/** Full agent chat tab: session bar, message list, composer, model selector. */
export function AgentChatView({ tabId, workspaceId, cwd }: AgentChatViewProps) {
  const session = agentChatStore((s) => s.sessionsByTabId[tabId]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start session on mount, stop on unmount.
  useEffect(() => {
    let sessionId: string | undefined;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        sessionId = await startAgentSession({ tabId, workspaceId, cwd });
        await fetchAgentModels({ tabId, sessionId });

        // Subscribe to agent.pi.event via daemon events stream.
        const client = await getDaemonClient();
        unsubscribe = client.events.frontendStream.subscribe(undefined, {
          onData: (event: { topic: string; payload: unknown }) => {
            if (event.topic === "agent.pi.event") {
              const p = event.payload as {
                sessionId: string;
                tabId: string;
                workspaceId: string;
                event: Record<string, unknown>;
              };
              if (p.tabId === tabId) {
                handleAgentPiEvent(p);
              }
            }
          },
        }).unsubscribe;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        agentChatStore.getState().initSession(tabId, tabId);
        agentChatStore.getState().setSessionError(tabId, message);
      }
    })();

    return () => {
      unsubscribe?.();
      if (sessionId) {
        stopAgentSession({ tabId, sessionId }).catch(() => {});
      }
    };
  }, [tabId, workspaceId, cwd]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages.length, session?.streamingMessage]);

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
    const nextLevel = THINKING_LEVELS[(currentIdx + 1) % THINKING_LEVELS.length]!;
    await setAgentThinkingLevel({ tabId, sessionId: sid!, level: nextLevel });
  }, [session?.sessionId, session?.thinkingLevel, tabId]);

  const allMessages = useMemo(() => {
    const msgs = [...(session?.messages ?? [])];
    if (session?.streamingMessage) {
      msgs.push(session.streamingMessage);
    }
    return msgs;
  }, [session?.messages, session?.streamingMessage]);

  if (!session) {
    return (
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Typography color="text.secondary">Starting agent session…</Typography>
      </Box>
    );
  }

  if (session.state === "error") {
    return (
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 1 }}>
        <Typography color="error.main" variant="body2">Failed to start agent session.</Typography>
        <Typography color="text.secondary" variant="caption" sx={{ maxWidth: 400, textAlign: "center" }}>
          {session.error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Session bar */}
      <AgentSessionBar
        state={session.state}
        modelName={session.currentModel?.name ?? ""}
        thinkingLevel={session.thinkingLevel}
        queue={session.queue}
        error={session.error}
      />

      {/* Messages */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflow: "auto",
          px: 2,
          py: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {allMessages.length === 0 && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <Typography color="text.secondary">Send a message to start the conversation.</Typography>
          </Box>
        )}
        {allMessages.map((msg) => (
          <AgentMessage key={msg.id} message={msg} />
        ))}
      </Box>

      {/* Composer + controls */}
      <Box
        sx={{
          borderTop: 1,
          borderColor: "divider",
          p: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {session.availableModels.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1 }}>
            <AgentModelSelector
              models={session.availableModels}
              currentModel={session.currentModel}
              thinkingLevel={session.thinkingLevel}
              onModelChange={handleModelChange}
              onThinkingLevelCycle={handleThinkingCycle}
            />
            {session.state === "running" && (
              <IconButton size="small" color="error" onClick={handleAbort} title="Stop" sx={{ fontSize: "0.75rem" }}>
                ■
              </IconButton>
            )}
          </Box>
        )}
        <RichComposer
          placeholder="Type a message…"
          onSubmit={handleSubmit}
          disabled={session.state === "starting"}
        />
      </Box>
    </Box>
  );
}
