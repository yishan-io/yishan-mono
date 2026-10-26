import { Box, Typography } from "@mui/material";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { openSubagentSessionInRightSplitPane } from "../../../commands/agentChatSubagentCommands";

import type { AgentModel, AgentQueueState } from "../../../chat/agentChatTypes";
import type { TranscriptDisplay } from "../../../chat/transcript/presentation.types";
import { formatSupportedThinkingLevels } from "../../../providers/agentThinkingLevels";
import { THINKING_LEVEL_LABELS } from "../../select-model/ThinkingLevelControl";
import { AgentMessageList } from "../transcript/AgentMessageList";

const EMPTY_PRESENTATION: TranscriptDisplay = { rows: [] };
const EMPTY_QUEUE: AgentQueueState = { steering: [], followUp: [] };

type AgentChatTranscriptPaneProps = {
  tabId: string;
  workspaceId: string;
  cwd: string;
  paneId?: string;
  isActive: boolean;
  isReadOnlySubagentDetail: boolean;
  parentSessionId?: string;
  emptyHelpLines?: string[];
  emptyHelpPrefix?: string;
};

type AgentChatSubagentDetailFooterProps = {
  model: AgentModel | null;
  contextTokens: number | undefined;
  thinkingLevel: string | null;
};

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

function AgentChatSubagentDetailFooter({ model, contextTokens, thinkingLevel }: AgentChatSubagentDetailFooterProps) {
  const contextUsed = contextTokens;
  const contextLabel =
    typeof contextUsed === "number"
      ? `${formatCompactTokenCount(contextUsed)}${model?.contextWindow ? ` / ${formatCompactTokenCount(model.contextWindow)}` : ""} tokens`
      : "Context unavailable";
  const modelLabel = model ? `${model.provider ? `${model.provider} / ` : ""}${model.name}` : "Model unavailable";
  const thinkingLevelLabel =
    thinkingLevel !== null ? (THINKING_LEVEL_LABELS[thinkingLevel] ?? THINKING_LEVEL_LABELS.off) : undefined;
  const supportedLevelsLabel = model ? formatSupportedThinkingLevels(model) : undefined;

  return (
    <Box
      sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 0.75, display: "flex", gap: 2, color: "text.secondary" }}
    >
      <Typography variant="caption">Model: {modelLabel}</Typography>
      <Typography variant="caption">Context: {contextLabel}</Typography>
      {thinkingLevelLabel !== undefined ? (
        <Typography
          variant="caption"
          title={supportedLevelsLabel ? `Supported levels: ${supportedLevelsLabel}` : undefined}
        >
          Thinking: {thinkingLevelLabel}
        </Typography>
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
  emptyHelpLines,
  emptyHelpPrefix,
}: AgentChatTranscriptPaneProps) {
  const { t } = useTranslation();
  const session = agentChatStore((state) => state.sessionsByTabId[tabId]);
  const sessions = agentChatStore((state) => state.sessionsByTabId);
  const presentation = session?.presentation ?? EMPTY_PRESENTATION;
  const sessionState = session?.state ?? "starting";
  const compactionReason = session?.compactionReason ?? null;
  const sessionId = session?.sessionId;
  const currentModel = session?.currentModel ?? null;
  const parentModel = (() => {
    if (!parentSessionId) {
      return null;
    }

    return Object.values(sessions).find((candidate) => candidate.sessionId === parentSessionId)?.currentModel ?? null;
  })();
  const queue = session?.queue ?? EMPTY_QUEUE;
  const footerModel = currentModel ?? parentModel;
  const thinkingLevel = session?.thinkingLevel ?? null;
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
  const workingLabel =
    sessionState === "compacting" ? t(`agentChat.compaction.${compactionReason ?? "generic"}`) : undefined;

  return (
    <>
      <AgentMessageList
        tabId={tabId}
        isActive={isActive}
        presentation={presentation}
        workspacePath={cwd}
        isWorking={isWorking}
        workingLabel={workingLabel}
        queuedMessages={isReadOnlySubagentDetail ? undefined : queue}
        emptyHelpLines={emptyHelpLines}
        emptyHelpPrefix={emptyHelpPrefix}
        onOpenCompletedSubagent={handleOpenCompletedSubagent}
      />
      {isReadOnlySubagentDetail ? (
        <AgentChatSubagentDetailFooter
          model={footerModel}
          contextTokens={presentation.contextTokens}
          thinkingLevel={thinkingLevel}
        />
      ) : null}
    </>
  );
}

/** Renders an agent session transcript and subagent-detail summary. */
export const MemoizedAgentChatTranscriptPane = memo(AgentChatTranscriptPane);
MemoizedAgentChatTranscriptPane.displayName = "AgentChatTranscriptPane";

import { agentChatStore } from "../../../state/agentChatStore";
