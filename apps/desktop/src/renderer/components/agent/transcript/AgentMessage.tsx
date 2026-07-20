import { Box, Paper, Typography } from "@mui/material";
import type { AgentMessage as AgentMessageType } from "../../../store/agentChatTypes";
import { AssistantMessageContent } from "./AssistantMessageContent";
import type { CompletedSubagentOpenTarget } from "../tool-calls/helpers";
import { ToolResultMessageContent } from "./ToolResultMessageContent";
import { UserMessageContent } from "./UserMessageContent";
import { type AgentToolResultMap, extractMessageText } from "./helpers";

type AgentMessageProps = {
  message: AgentMessageType;
  mergedToolResults?: AgentToolResultMap;
  workspacePath?: string;
  isStreaming?: boolean;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/** Renders a single agent conversation message and routes by message role. */
export function AgentMessage({
  message,
  mergedToolResults = {},
  workspacePath,
  isStreaming = false,
  onOpenCompletedSubagent,
}: AgentMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isToolResult = message.role === "toolResult";
  const messageText = extractMessageText(message.content);
  const humanTimestamp = typeof message.timestamp === "number" ? formatHumanMessageTime(message.timestamp) : null;
  const durationLabel =
    isAssistant && typeof message.durationMs === "number" ? `time took: ${formatDuration(message.durationMs)}` : null;
  const showsMetadata = humanTimestamp !== null || durationLabel !== null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        width: "100%",
        borderRadius: 0,
        bgcolor: isUser ? "action.selected" : isToolResult ? "action.hover" : "transparent",
      }}
    >
      {isUser ? <UserMessageContent messageText={messageText} /> : null}
      {isAssistant ? (
        <AssistantMessageContent
          message={message}
          mergedToolResults={mergedToolResults}
          workspacePath={workspacePath}
          isStreaming={isStreaming}
          onOpenCompletedSubagent={onOpenCompletedSubagent}
        />
      ) : null}
      {isToolResult ? <ToolResultMessageContent message={message} /> : null}

      {showsMetadata ? (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
          {humanTimestamp ? <Box component="span">{humanTimestamp}</Box> : null}
          {humanTimestamp && durationLabel ? (
            <Box component="span" sx={{ mx: 0.75 }}>
              ·
            </Box>
          ) : null}
          {durationLabel ? <Box component="span">{durationLabel}</Box> : null}
        </Typography>
      ) : null}
    </Paper>
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = durationMs / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}

function formatHumanMessageTime(timestamp: number): string | null {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
