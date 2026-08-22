import { Box, CircularProgress, IconButton, Paper, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { AgentToolCallLifecycleState } from "../../../../../domains/agent/chat/agentChatSubagents";
import { AgentToolCallGroup } from "../tool-calls/AgentToolCallGroup";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentMarkdownContent } from "./AgentMarkdownContent";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolResultMessageContent } from "./ToolResultMessageContent";
import {
  type Turn,
  type TurnSection,
  buildTurnSections,
  extractTurnSummaryText,
  extractTurnSummaryThinking,
  formatTurnDuration,
  getTurnLiveElapsedMs,
  getTurnWorkedDurationMs,
} from "./turnModel";

/** Persists per-turn collapse state across virtualized row unmounts (mirrors savedScrollTopByTabId). */
const collapsedTurnIds = new Set<string>();

type AgentTurnProps = {
  turn: Turn;
  workspacePath?: string;
  agentToolCallStates?: ReadonlyMap<string, AgentToolCallLifecycleState>;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/**
 * Renders one assistant turn (the collapsible unit of the transcript, starting
 * at the assistant message): a status header (live elapsed like "working 12s"
 * while running, "Worked Xs" after it ends) with a collapse toggle. Collapsing
 * hides only the working content (thinking, tool calls); the final summary
 * message's thinking and text stay visible below the header.
 */
export function AgentTurn({ turn, workspacePath, agentToolCallStates, onOpenCompletedSubagent }: AgentTurnProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !collapsedTurnIds.has(turn.id));
  const isExpanded = open || turn.isWorking;
  const workedDurationMs = getTurnWorkedDurationMs(turn);
  const liveElapsedMs = getTurnLiveElapsedMs(turn, useLiveNow(turn.isWorking));
  const collapseLabel = isExpanded ? t("agentChat.turn.collapse") : t("agentChat.turn.expand");
  const handleToggle = () => {
    if (turn.isWorking) {
      return;
    }
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        collapsedTurnIds.delete(turn.id);
      } else {
        collapsedTurnIds.add(turn.id);
      }
      return next;
    });
  };

  const summaryText = useMemo(() => extractTurnSummaryText(turn.items), [turn.items]);
  const summaryItemId = useMemo(() => {
    for (let index = turn.items.length - 1; index >= 0; index -= 1) {
      const item = turn.items[index];
      if (item?.message.role === "assistant") {
        return item.message.id;
      }
    }
    return null;
  }, [turn.items]);
  const summaryThinking = useMemo(
    () => extractTurnSummaryThinking(turn.items, summaryItemId),
    [summaryItemId, turn.items],
  );
  const sections = useMemo(
    () => buildTurnSections(turn.items, summaryItemId, summaryText),
    [summaryItemId, summaryText, turn.items],
  );
  const summaryItemIsStreaming = useMemo(() => {
    const item = turn.items.find((candidate) => candidate.message.id === summaryItemId);
    return item?.isStreaming ?? false;
  }, [summaryItemId, turn.items]);
  const hasCollapsibleContent = sections.length > 0 || turn.items.some((item) => item.message.role === "toolResult");

  return (
    <Paper
      elevation={0}
      data-testid="agent-turn"
      sx={{
        width: "100%",
        bgcolor: "transparent",
        mt: 1.5,
        mb: 1,
      }}
    >
      <Box
        data-testid="agent-turn-header"
        onClick={handleToggle}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.5,
          cursor: turn.isWorking || !hasCollapsibleContent ? "default" : "pointer",
        }}
      >
        {turn.isWorking ? <CircularProgress size={14} thickness={5} aria-hidden /> : null}
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          {turn.isWorking
            ? liveElapsedMs !== null
              ? t("agentChat.turn.workingDuration", { duration: formatTurnDuration(liveElapsedMs) })
              : t("agentChat.turn.working")
            : workedDurationMs !== null
              ? t("agentChat.turn.worked", { duration: formatTurnDuration(workedDurationMs) })
              : null}
        </Typography>
        {hasCollapsibleContent ? (
          <IconButton
            aria-expanded={isExpanded}
            aria-label={collapseLabel}
            sx={{ width: 20, height: 20, flexShrink: 0, color: "text.secondary" }}
          >
            {isExpanded ? (
              <LuChevronDown data-testid="turn-chevron-down" size={14} />
            ) : (
              <LuChevronRight data-testid="turn-chevron-right" size={14} />
            )}
          </IconButton>
        ) : null}
      </Box>
      {isExpanded && hasCollapsibleContent ? (
        <Box data-testid="agent-turn-body" sx={{ px: 1.5, py: 0.5, display: "flex", flexDirection: "column", gap: 1 }}>
          {sections.map((section, sectionIndex) =>
            section.kind === "text" ? (
              <AgentMarkdownContent
                key={`${turn.id}-text-${sectionIndex}`}
                content={section.text}
                workspacePath={workspacePath}
                renderMode={section.isStreaming ? "streaming" : "final"}
              />
            ) : (
              <AgentToolCallGroup
                key={getRunKey(turn.id, section)}
                id={getRunKey(turn.id, section)}
                blocks={section.blocks}
                showRunningBlocks={turn.isWorking}
                agentToolCallStates={agentToolCallStates}
                workspacePath={workspacePath}
                onOpenCompletedSubagent={onOpenCompletedSubagent}
              />
            ),
          )}
          {turn.items.map((item) => {
            if (item.message.role !== "toolResult") {
              return null;
            }
            return (
              <Paper
                key={item.message.id}
                elevation={0}
                sx={{
                  p: 1.5,
                  width: "100%",
                  bgcolor: "action.hover",
                  borderRadius: 0,
                }}
              >
                <ToolResultMessageContent message={item.message} />
              </Paper>
            );
          })}
        </Box>
      ) : null}
      {summaryThinking.length > 0 || summaryText ? (
        <Box
          data-testid="agent-turn-summary"
          sx={{
            px: 1.5,
            pb: 1.5,
            pt: hasCollapsibleContent ? 0.5 : 1,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {summaryThinking.map((block) => (
            <ThinkingBlock
              key={block.id}
              thinking={block.thinking}
              thinkingSignature={block.thinkingSignature}
              isStreaming={block.isStreaming}
            />
          ))}
          {summaryText ? (
            <AgentMarkdownContent
              content={summaryText}
              workspacePath={workspacePath}
              renderMode={summaryItemIsStreaming ? "streaming" : "final"}
            />
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}

function getRunKey(turnId: string, section: Extract<TurnSection, { kind: "toolRun" }>): string {
  const firstBlockId = section.blocks[0]?.id;
  // Key by the first block id so streaming reflows (new text sections inserted
  // before this run) do not remount the group and reset its expansion state.
  return firstBlockId ? `${turnId}-run-${firstBlockId}` : `${turnId}-run-${section.blocks.length}`;
}

/** Ticks once per second while `active`, giving the live elapsed header its clock. */
function useLiveNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [active, intervalMs]);

  return now;
}
