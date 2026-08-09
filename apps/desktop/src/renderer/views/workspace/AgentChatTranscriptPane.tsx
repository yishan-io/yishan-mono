import { Box, Typography } from "@mui/material";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { openSubagentSessionInRightSplitPane } from "../../commands/agentChatSubagentCommands";
import { THINKING_LEVEL_LABELS } from "../../components/agent/session/ThinkingLevelControl";
import { AgentMessageList } from "../../components/agent/transcript/AgentMessageList";
import { agentChatStore } from "../../store/agentChatStore";
import type { AgentMessage, AgentModel, AgentQueueState } from "../../store/agentChatTypes";

const EMPTY_MESSAGES: AgentMessage[] = [];
const EMPTY_QUEUE: AgentQueueState = { steering: [], followUp: [] };

type AgentChatTranscriptPaneProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  isActive: boolean;
  isReadOnlySubagentDetail: boolean;
  parentSessionId?: string;
};

type AgentChatSubagentDetailFooterProps = {
  model: AgentModel | null;
  usage: AgentMessage["usage"] | null;
  thinkingLevel: string | null;
};

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

function AgentChatSubagentDetailFooter({ model, usage, thinkingLevel }: AgentChatSubagentDetailFooterProps) {
  const contextUsed = usage?.totalTokens ?? usage?.total;
  const contextLabel =
    typeof contextUsed === "number"
      ? `${formatCompactTokenCount(contextUsed)}${model?.contextWindow ? ` / ${formatCompactTokenCount(model.contextWindow)}` : ""} tokens`
      : "Context unavailable";
  const modelLabel = model ? `${model.provider ? `${model.provider} / ` : ""}${model.name}` : "Model unavailable";
  const thinkingLevelLabel =
    thinkingLevel !== null ? (THINKING_LEVEL_LABELS[thinkingLevel] ?? THINKING_LEVEL_LABELS.off) : undefined;

  return (
    <Box
      sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 0.75, display: "flex", gap: 2, color: "text.secondary" }}
    >
      <Typography variant="caption">Model: {modelLabel}</Typography>
      <Typography variant="caption">Context: {contextLabel}</Typography>
      {thinkingLevelLabel !== undefined ? (
        <Typography variant="caption">Thinking: {thinkingLevelLabel}</Typography>
      ) : null}
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
  parentSessionId,
}: AgentChatTranscriptPaneProps) {
  const { t } = useTranslation();
  const messages = agentChatStore((state) => state.sessionsByTabId[tabId]?.messages ?? EMPTY_MESSAGES);
  const trailingMessage = agentChatStore((state) => state.sessionsByTabId[tabId]?.streamingMessage ?? null);
  const sessionState = agentChatStore((state) => state.sessionsByTabId[tabId]?.state ?? "starting");
  const compactionReason = agentChatStore((state) => state.sessionsByTabId[tabId]?.compactionReason ?? null);
  const sessionId = agentChatStore((state) => state.sessionsByTabId[tabId]?.sessionId);
  const currentModel = agentChatStore((state) => state.sessionsByTabId[tabId]?.currentModel ?? null);
  const parentModel = agentChatStore((state) => {
    if (!parentSessionId) {
      return null;
    }

    return (
      Object.values(state.sessionsByTabId).find((session) => session.sessionId === parentSessionId)?.currentModel ??
      null
    );
  });
  const queue = agentChatStore((state) => state.sessionsByTabId[tabId]?.queue ?? EMPTY_QUEUE);
  const isTurnActive = agentChatStore((state) => state.sessionsByTabId[tabId]?.isTurnActive ?? false);
  const footerModel = currentModel ?? parentModel;
  const thinkingLevel = agentChatStore((state) => state.sessionsByTabId[tabId]?.thinkingLevel ?? null);
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

  const isWorking = sessionState === "running" || sessionState === "compacting";
  const isTurnRunning = sessionState === "running" && isTurnActive;
  const workingLabel =
    sessionState === "compacting" ? t(`agentChat.compaction.${compactionReason ?? "generic"}`) : undefined;

  return (
    <>
      <AgentMessageList
        tabId={tabId}
        isActive={isActive}
        messages={messages}
        trailingMessage={trailingMessage}
        emptyPrompt="Send a message to start the conversation."
        workspacePath={cwd}
        isWorking={isWorking}
        isTurnRunning={isTurnRunning}
        workingLabel={workingLabel}
        queuedMessages={isReadOnlySubagentDetail ? undefined : queue}
        onOpenCompletedSubagent={handleOpenCompletedSubagent}
      />
      {isReadOnlySubagentDetail ? (
        <AgentChatSubagentDetailFooter model={footerModel} usage={latestUsage} thinkingLevel={thinkingLevel} />
      ) : null}
    </>
  );
}

/** Renders an agent session transcript and subagent-detail summary. */
export const MemoizedAgentChatTranscriptPane = memo(AgentChatTranscriptPane);
MemoizedAgentChatTranscriptPane.displayName = "AgentChatTranscriptPane";
