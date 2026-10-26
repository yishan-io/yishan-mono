import { Box, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuChevronRight, LuLayers } from "react-icons/lu";
import type { GroupDisplay, GroupSummaryItem } from "../../../chat/transcript/presentation.types";
import { ThinkingBlock } from "../transcript/ThinkingBlock";
import { AgentToolCallCard } from "./AgentToolCallCard";
import type { CompletedSubagentOpenTarget } from "./summary";

/** Persists expanded tool-run groups across virtualized row unmounts (mirrors savedScrollTopByTabId). */
const expandedToolRunIds = new Set<string>();

type AgentToolCallGroupProps = {
  group: GroupDisplay;
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
  group,
  showRunningBlocks,
  workspacePath,
  onOpenCompletedSubagent,
}: AgentToolCallGroupProps) {
  const { t } = useTranslation();
  const { id, members: blocks } = group;
  const [open, setOpen] = useState(() => expandedToolRunIds.has(id));
  if (blocks.length === 0) return null;

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

  const summary = formatToolCallSummary(group.summaryItems, t);
  const collapsedBlocks = group.pendingMembers;
  const isLive = showRunningBlocks && group.isLive;

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
              <ThinkingBlock key={block.key} model={block} />
            ) : (
              <AgentToolCallCard
                key={block.callId}
                {...block}
                workspacePath={workspacePath}
                onOpenCompletedSubagent={onOpenCompletedSubagent}
              />
            ),
          )}
        </Box>
      ) : showRunningBlocks && collapsedBlocks.length > 0 ? (
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
          {collapsedBlocks.map((block) =>
            block.kind === "thinking" ? (
              <ThinkingBlock key={block.key} model={block} />
            ) : (
              <AgentToolCallCard
                key={block.callId}
                {...block}
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

function formatToolCallSummary(
  items: readonly GroupSummaryItem[],
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
