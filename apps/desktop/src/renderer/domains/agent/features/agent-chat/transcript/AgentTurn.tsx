import { Box, CircularProgress, IconButton, Paper, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { TurnDisplay } from "../../../chat/transcript/presentation.types";
import { AgentToolCallGroup } from "../tool-calls/AgentToolCallGroup";
import type { CompletedSubagentOpenTarget } from "../tool-calls/summary";
import { AgentMarkdownContent } from "./AgentMarkdownContent";
import { ThinkingBlock } from "./ThinkingBlock";
import { formatTurnDuration } from "./turnDuration";

/** Persists per-turn collapse state across virtualized row unmounts (mirrors savedScrollTopByTabId). */
const collapsedTurnIds = new Set<string>();

type AgentTurnProps = {
  turn: TurnDisplay;
  workspacePath?: string;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/**
 * Renders one assistant turn (the collapsible unit of the transcript, starting
 * at the assistant message): a status header (live elapsed like "working 12s"
 * while running, "Worked Xs" after it ends) with a collapse toggle. Collapsing
 * hides only the working content (thinking, tool calls); the final summary
 * message's thinking and text stay visible below the header.
 */
export function AgentTurn({ turn, workspacePath, onOpenCompletedSubagent }: AgentTurnProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !collapsedTurnIds.has(turn.id));
  const isExpanded = open || turn.isWorking;
  const workedDurationMs = turn.workedDurationMs;
  const startedAtMs = turn.startedAtMs ?? turn.startTimestampMs;
  const now = useLiveNow(turn.isWorking && startedAtMs !== undefined);
  const liveElapsedMs = turn.isWorking && startedAtMs !== undefined ? Math.max(0, now - startedAtMs) : null;
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

  const summaryText = turn.summary?.text;
  const summaryThinking = turn.summary?.thinking ?? [];
  const hasCollapsibleContent = turn.blocks.length > 0;

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
          {turn.blocks.map((section, sectionIndex) =>
            section.kind === "text" ? (
              <AgentMarkdownContent
                key={`${turn.id}-text-${sectionIndex}`}
                content={section.text}
                workspacePath={workspacePath}
                renderMode={section.isStreaming ? "streaming" : "final"}
              />
            ) : section.kind === "thinking" ? (
              <ThinkingBlock key={section.key} model={section} />
            ) : (
              <AgentToolCallGroup
                key={section.id}
                group={section}
                showRunningBlocks={turn.isWorking}
                workspacePath={workspacePath}
                onOpenCompletedSubagent={onOpenCompletedSubagent}
              />
            ),
          )}
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
            <ThinkingBlock key={block.key} model={block} />
          ))}
          {summaryText ? (
            <AgentMarkdownContent
              content={summaryText}
              workspacePath={workspacePath}
              renderMode={turn.summary?.isStreaming ? "streaming" : "final"}
            />
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
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
