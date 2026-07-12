import { Box, Collapse, IconButton, Paper, Typography } from "@mui/material";
import { useState } from "react";
import { LuChevronDown, LuChevronUp, LuSparkles } from "react-icons/lu";
import { parseSkillMessage } from "../../helpers/agentSkillTextHelpers";
import type { AgentContentBlock, AgentMessage as AgentMessageType } from "../../store/agentChatTypes";
import { AgentMarkdownContent } from "./AgentMarkdownContent";
import { AgentToolCallCard } from "./AgentToolCallCard";

export type AgentToolResultMap = Record<string, AgentMessageType | undefined>;

/** Extracts text from a message's content regardless of string or array format. */
function extractText(content: string | AgentContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Extract<AgentContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

type AgentMessageProps = {
  message: AgentMessageType;
  mergedToolResults?: AgentToolResultMap;
  workspacePath?: string;
  isStreaming?: boolean;
};

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = durationMs / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}

/** Renders a single agent conversation message with support for text, thinking, and tool calls. */
export function AgentMessage({
  message,
  mergedToolResults = {},
  workspacePath,
  isStreaming = false,
}: AgentMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isToolResult = message.role === "toolResult";
  const blocks = Array.isArray(message.content) ? message.content : [];
  const messageText = extractText(message.content);
  const skillMessage = isUser ? parseSkillMessage(messageText) : null;
  let textBlockCount = 0;
  let thinkingBlockCount = 0;

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
      {isUser &&
        (skillMessage ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}>
              <LuSparkles size={14} />
              <Typography variant="body2">
                use skill:{" "}
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {skillMessage.skillName}
                </Box>
              </Typography>
            </Box>
            {skillMessage.trailingContent ? (
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {skillMessage.trailingContent}
              </Typography>
            ) : null}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {messageText}
          </Typography>
        ))}

      {isAssistant &&
        blocks.map((block) => {
          switch (block.type) {
            case "text": {
              const key = `${message.id}-text-${textBlockCount}`;
              textBlockCount += 1;
              return <AgentMarkdownContent key={key} content={block.text} workspacePath={workspacePath} />;
            }
            case "thinking": {
              if (block.thinking.trim().length === 0) {
                return null;
              }
              const key = `${message.id}-thinking-${thinkingBlockCount}`;
              thinkingBlockCount += 1;
              return <ThinkingBlock key={key} thinking={block.thinking} isStreaming={isStreaming} />;
            }
            case "toolCall":
              return <AgentToolCallCard key={block.id} toolCall={block} result={mergedToolResults[block.id] ?? null} />;
            default:
              return null;
          }
        })}

      {isToolResult && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {message.toolName ?? "tool"}
            {message.isError ? " (error)" : ""}
          </Typography>
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", mt: 0.5, color: message.isError ? "error.main" : undefined }}
          >
            {extractText(message.content)}
          </Typography>
        </Box>
      )}

      {isAssistant && typeof message.durationMs === "number" && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
          time took: {formatDuration(message.durationMs)}
        </Typography>
      )}
    </Paper>
  );
}

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          cursor: "pointer",
          px: 1,
          py: 0.5,
          borderRadius: 1,
          bgcolor: "action.hover",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {isStreaming ? "Thinking" : "Thought"}
        </Typography>
        <IconButton size="small" sx={{ ml: "auto", width: 20, height: 20 }}>
          {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Typography
          variant="body2"
          sx={{ whiteSpace: "pre-wrap", px: 1, py: 0.5, color: "text.disabled", fontStyle: "italic" }}
        >
          {thinking}
        </Typography>
      </Collapse>
    </Box>
  );
}
