import { Box, Typography } from "@mui/material";
import { memo, useCallback, useMemo } from "react";
import { openSubagentSessionInRightSplitPane } from "../../commands/agentChatSubagentCommands";
import { AgentMessageList } from "../../components/agent/transcript/AgentMessageList";
import { agentChatStore } from "../../store/agentChatStore";
import type { AgentMessage, AgentModel } from "../../store/agentChatTypes";

const EMPTY_MESSAGES: AgentMessage[] = [];

type AgentChatTranscriptPaneProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  isActive: boolean;
  isReadOnlySubagentDetail: boolean;
};

type AgentChatSubagentDetailFooterProps = {
  model: AgentModel | null;
  usage: AgentMessage["usage"] | null;
};

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
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
      sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 0.75, display: "flex", gap: 2, color: "text.secondary" }}
    >
      <Typography variant="caption">Model: {modelLabel}</Typography>
      <Typography variant="caption">Context: {contextLabel}</Typography>
    </Box>
  );
}

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

/** Renders an agent session transcript and subagent-detail summary. */
export const MemoizedAgentChatTranscriptPane = memo(AgentChatTranscriptPane);
MemoizedAgentChatTranscriptPane.displayName = "AgentChatTranscriptPane";
