import { Box, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuChevronRight, LuLayers } from "react-icons/lu";
import { ThinkingBlock } from "../transcript/ThinkingBlock";
import type { TurnWorkingBlock } from "../transcript/turnModel";
import { AgentToolCallCard } from "./AgentToolCallCard";
import { type CompletedSubagentOpenTarget, type ToolCallSummaryItem, summarizeToolCalls } from "./summary";

/** Persists expanded tool-run groups across virtualized row unmounts (mirrors savedScrollTopByTabId). */
const expandedToolRunIds = new Set<string>();

type AgentToolCallGroupProps = {
  /** Stable identity for this tool run, used for collapse-state persistence. */
  id: string;
  /** All working blocks of the turn (thinking + tool calls) in original order. */
  blocks: TurnWorkingBlock[];
  /**
   * Whether the owning turn is still working; while true, the collapsed group
   * shows the blocks that are still running (tool calls awaiting results,
   * streaming thoughts) under the summary header.
   */
  showRunningBlocks: boolean;
  workspacePath?: string;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/**
 * Collapsed-by-default group for one tool run, Codex-style: thinking blocks and
 * tool calls stay in order inside the group. While the owning turn is still
 * working, the collapsed group shows the still-running blocks under the summary
 * header so parallel in-flight commands and sub-agents all stay visible;
 * finished runs show only the summary header.
 */
export function AgentToolCallGroup({
  id,
  blocks,
  showRunningBlocks,
  workspacePath,
  onOpenCompletedSubagent,
}: AgentToolCallGroupProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => expandedToolRunIds.has(id));
  if (blocks.length === 0) {
    return null;
  }

  const toolCalls = blocks.filter((block): block is Extract<TurnWorkingBlock, { kind: "toolCall" }> => {
    return block.kind === "toolCall";
  });
  if (toolCalls.length === 0) {
    // No tool calls in this section — render the thinking blocks standalone
    // (full width, no stack chrome) so they never read as part of the tool stack.
    const thinkingBlocks = blocks.filter((block): block is Extract<TurnWorkingBlock, { kind: "thinking" }> => {
      return block.kind === "thinking";
    });
    return (
      <Box data-testid="agent-tool-call-group" sx={{ mb: 0.5, display: "flex", flexDirection: "column" }}>
        {thinkingBlocks.map((block) => (
          <ThinkingBlock
            key={block.id}
            thinking={block.thinking}
            thinkingSignature={block.thinkingSignature}
            isStreaming={block.isStreaming}
          />
        ))}
      </Box>
    );
  }

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        expandedToolRunIds.add(id);
      } else {
        expandedToolRunIds.delete(id);
      }
      return next;
    });
  };

  const summary = formatToolCallSummary(
    summarizeToolCalls(toolCalls.map((block) => ({ toolCall: block.toolCall, result: block.result }))),
    t,
  );
  const runningBlocks = blocks.filter(isRunningBlock);
  // The header shimmers with an animated gradient while the stack is live (the
  // same condition that shows the running-blocks panel), mirroring Codex.
  const isLive = showRunningBlocks && runningBlocks.length > 0;

  return (
    <Box data-testid="agent-tool-call-group" sx={{ mb: 0.5 }}>
      <Box
        data-testid="agent-tool-call-group-header"
        onClick={toggleOpen}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 0.5,
          cursor: "pointer",
        }}
      >
        <Box component="span" aria-hidden sx={{ display: "inline-flex", alignItems: "center", opacity: 0.8 }}>
          <LuLayers size={14} />
        </Box>
        <Typography
          variant="body2"
          noWrap
          data-testid="agent-tool-call-group-header-text"
          sx={{
            minWidth: 0,
            flexShrink: 1,
            color: isLive ? "transparent" : "text.disabled",
            ...(isLive
              ? {
                  "@keyframes tool-stack-gradient": {
                    "0%": { backgroundPosition: "0% 50%" },
                    "50%": { backgroundPosition: "100% 50%" },
                    "100%": { backgroundPosition: "0% 50%" },
                  },
                  backgroundImage: (theme) => buildLiveHeaderGradient(theme.palette.primary.main),
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  fontWeight: 600,
                  animation: "tool-stack-gradient 1.6s linear infinite",
                  "@media (prefers-reduced-motion: reduce)": {
                    animation: "none",
                  },
                }
              : {}),
          }}
        >
          {summary}
        </Typography>
        <IconButton
          aria-expanded={open}
          aria-label={open ? "Collapse tool calls" : "Expand tool calls"}
          sx={{ width: 20, height: 20, flexShrink: 0, color: "text.secondary" }}
        >
          {open ? (
            <LuChevronDown data-testid="tool-group-chevron-down" size={14} />
          ) : (
            <LuChevronRight data-testid="tool-group-chevron-right" size={14} />
          )}
        </IconButton>
      </Box>
      {open ? (
        <Box
          data-testid="agent-tool-call-group-body"
          sx={{
            mt: 0.5,
            ml: 1,
            pl: 1.5,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px dotted",
            borderLeftColor: "divider",
          }}
        >
          {blocks.map((block) =>
            block.kind === "thinking" ? (
              <ThinkingBlock
                key={block.id}
                thinking={block.thinking}
                thinkingSignature={block.thinkingSignature}
                isStreaming={block.isStreaming}
              />
            ) : (
              <AgentToolCallCard
                key={block.id}
                toolCall={block.toolCall}
                result={block.result}
                workspacePath={workspacePath}
                onOpenCompletedSubagent={onOpenCompletedSubagent}
              />
            ),
          )}
        </Box>
      ) : showRunningBlocks && runningBlocks.length > 0 ? (
        <Box
          data-testid="agent-tool-call-group-live"
          sx={{
            mt: 0.5,
            ml: 1,
            pl: 1.5,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px dotted",
            borderLeftColor: "divider",
          }}
        >
          {runningBlocks.map((block) =>
            block.kind === "thinking" ? (
              <ThinkingBlock
                key={block.id}
                thinking={block.thinking}
                thinkingSignature={block.thinkingSignature}
                isStreaming={block.isStreaming}
              />
            ) : (
              <AgentToolCallCard
                key={block.id}
                toolCall={block.toolCall}
                result={block.result}
                workspacePath={workspacePath}
                onOpenCompletedSubagent={onOpenCompletedSubagent}
              />
            ),
          )}
        </Box>
      ) : null}
    </Box>
  );
}

function isRunningBlock(block: TurnWorkingBlock): boolean {
  // A tool call is still running until its merged result arrives (a background
  // sub-agent or slow command keeps its card live even after its message was
  // finalized); a thought is live only while its message is still streaming.
  // The panel only renders while the owning turn is working (session running
  // with an active turn), so cleanly stopped sessions never show phantom cards.
  // Residual edge case: a tool call interrupted without ever producing a result
  // message stays classified as running for the remainder of the working turn
  // (e.g. a cancelled delegation followed by an automatic follow-up).
  if (block.kind === "toolCall") {
    return block.result === null;
  }
  return block.isStreaming;
}

function formatToolCallSummary(
  items: ToolCallSummaryItem[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return items
    .map((item) => {
      const options: Record<string, unknown> = { count: item.count };
      if (item.toolName !== undefined) {
        options.toolName = item.toolName;
      }
      return t(`agentChat.toolGroup.${item.key}`, options);
    })
    .join(" · ");
}

/**
 * Animated-gradient stops for the live tool-stack header text: the theme's
 * primary color at both ends with the brand amber as the bright sweep between
 * them, so the shimmer adapts to light/dark mode.
 */
export function buildLiveHeaderGradient(primaryMain: string): string {
  return `linear-gradient(90deg, ${primaryMain}, #f0a229, ${primaryMain})`;
}
