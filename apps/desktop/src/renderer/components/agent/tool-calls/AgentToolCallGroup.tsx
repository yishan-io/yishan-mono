import { Box, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { LuChevronDown, LuChevronRight, LuLayers } from "react-icons/lu";
import { ThinkingBlock } from "../transcript/ThinkingBlock";
import type { TurnWorkingBlock } from "../transcript/turnModel";
import { AgentToolCallCard } from "./AgentToolCallCard";
import { type CompletedSubagentOpenTarget, summarizeToolCalls } from "./helpers";

type AgentToolCallGroupProps = {
  /** All working blocks of the turn (thinking + tool calls) in original order. */
  blocks: TurnWorkingBlock[];
  /** Whether the owning turn is still running. */
  isTurnWorking: boolean;
  workspacePath?: string;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/**
 * Collapsed-by-default group for the working content of one turn, Codex-style:
 * thinking blocks and tool calls stay in order inside the group. While the
 * turn is running the collapsed group shows only the latest working block; the
 * summary header ("read 3 files · ran 2 commands") is always expandable to
 * reveal everything.
 */
export function AgentToolCallGroup({
  blocks,
  isTurnWorking,
  workspacePath,
  onOpenCompletedSubagent,
}: AgentToolCallGroupProps) {
  const [open, setOpen] = useState(false);
  if (blocks.length === 0) {
    return null;
  }

  const toolCalls = blocks.filter((block): block is Extract<TurnWorkingBlock, { kind: "toolCall" }> => {
    return block.kind === "toolCall";
  });
  if (toolCalls.length === 0) {
    // No tool calls in this turn — render the thinking blocks directly without group chrome.
    const thinkingBlocks = blocks.filter((block): block is Extract<TurnWorkingBlock, { kind: "thinking" }> => {
      return block.kind === "thinking";
    });
    return (
      <Box data-testid="agent-tool-call-group" sx={{ mb: 0.5, pl: 1.5, display: "flex", flexDirection: "column" }}>
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

  const summary = summarizeToolCalls(
    toolCalls.map((block) => ({ toolCall: block.toolCall, result: block.result })),
  ).join(" · ");
  const latestBlock = blocks[blocks.length - 1];

  return (
    <Box data-testid="agent-tool-call-group" sx={{ mb: 0.5 }}>
      <Box
        data-testid="agent-tool-call-group-header"
        onClick={() => setOpen(!open)}
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
        <Typography variant="body2" noWrap sx={{ color: "text.disabled", minWidth: 0, flexShrink: 1 }}>
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
      ) : isTurnWorking && latestBlock ? (
        <Box
          data-testid="agent-tool-call-group-latest"
          sx={{
            mt: 0.5,
            ml: 1,
            pl: 1.5,
            borderLeft: "1px dotted",
            borderLeftColor: "divider",
          }}
        >
          {latestBlock.kind === "thinking" ? (
            <ThinkingBlock
              thinking={latestBlock.thinking}
              thinkingSignature={latestBlock.thinkingSignature}
              isStreaming={latestBlock.isStreaming}
            />
          ) : (
            <AgentToolCallCard
              toolCall={latestBlock.toolCall}
              result={latestBlock.result}
              workspacePath={workspacePath}
              onOpenCompletedSubagent={onOpenCompletedSubagent}
            />
          )}
        </Box>
      ) : null}
    </Box>
  );
}
