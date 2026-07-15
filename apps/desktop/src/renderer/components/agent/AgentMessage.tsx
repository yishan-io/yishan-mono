import { Box, Collapse, IconButton, Paper, Typography } from "@mui/material";
import { useState } from "react";
import { LuChevronDown, LuChevronUp, LuSparkles } from "react-icons/lu";
import { parseSkillMessage } from "../../helpers/agentSkillTextHelpers";
import type {
  AgentContentBlock,
  AgentMessage as AgentMessageType,
  AgentThinkingSignature,
} from "../../store/agentChatTypes";
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

function formatHumanMessageTime(timestamp: number): string | null {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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
              return (
                <AgentMarkdownContent
                  key={key}
                  content={block.text}
                  workspacePath={workspacePath}
                  renderMode={isStreaming ? "streaming" : "final"}
                />
              );
            }
            case "thinking": {
              if (block.thinking.trim().length === 0) {
                return null;
              }
              const key = `${message.id}-thinking-${thinkingBlockCount}`;
              thinkingBlockCount += 1;
              return (
                <ThinkingBlock
                  key={key}
                  thinking={block.thinking}
                  thinkingSignature={block.thinkingSignature}
                  isStreaming={isStreaming}
                />
              );
            }
            case "toolCall":
              return (
                <AgentToolCallCard
                  key={block.id}
                  toolCall={block}
                  result={mergedToolResults[block.id] ?? null}
                  workspacePath={workspacePath}
                />
              );
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

      {showsMetadata && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
          {humanTimestamp ? <Box component="span">{humanTimestamp}</Box> : null}
          {humanTimestamp && durationLabel ? (
            <Box component="span" sx={{ mx: 0.75 }}>
              ·
            </Box>
          ) : null}
          {durationLabel ? <Box component="span">{durationLabel}</Box> : null}
        </Typography>
      )}
    </Paper>
  );
}

function ThinkingBlock({
  thinking,
  thinkingSignature,
  isStreaming,
}: {
  thinking: string;
  thinkingSignature?: string | AgentThinkingSignature;
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summaryText = getThinkingSummaryText(thinkingSignature);
  const hasExpandableDetails = hasExpandableThinkingDetails(thinking, summaryText);
  const visibleText = summaryText ?? null;

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        onClick={() => {
          if (hasExpandableDetails) {
            setOpen(!open);
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          cursor: hasExpandableDetails ? "pointer" : "default",
          px: 1,
          py: 0.5,
          borderRadius: 1,
          bgcolor: "action.hover",
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {isStreaming ? "Thinking" : "Thought"}
        </Typography>
        {visibleText ? (
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, flex: 1 }}>
            {visibleText}
          </Typography>
        ) : null}
        {hasExpandableDetails ? (
          <IconButton size="small" aria-label="Toggle thought details" sx={{ ml: "auto", width: 20, height: 20 }}>
            {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
          </IconButton>
        ) : null}
      </Box>
      {hasExpandableDetails ? (
        <Collapse in={open}>
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", px: 1, py: 0.5, color: "text.disabled", fontStyle: "italic" }}
          >
            {thinking}
          </Typography>
        </Collapse>
      ) : null}
    </Box>
  );
}

function getThinkingSummaryText(thinkingSignature: string | AgentThinkingSignature | undefined): string | null {
  const parsedSignature = parseThinkingSignature(thinkingSignature);
  const summaryItems = parsedSignature?.summary;
  if (!summaryItems || summaryItems.length === 0) {
    return null;
  }

  const summaryText = summaryItems
    .map((summaryItem) => summaryItem.text.trim())
    .filter((text) => text.length > 0)
    .join(" ")
    .trim();
  return summaryText.length > 0 ? summaryText : null;
}

function parseThinkingSignature(
  thinkingSignature: string | AgentThinkingSignature | undefined,
): AgentThinkingSignature | null {
  if (!thinkingSignature) {
    return null;
  }

  if (typeof thinkingSignature === "string") {
    try {
      const parsedSignature = JSON.parse(thinkingSignature) as AgentThinkingSignature;
      return typeof parsedSignature === "object" && parsedSignature !== null ? parsedSignature : null;
    } catch {
      return null;
    }
  }

  return thinkingSignature;
}

function hasExpandableThinkingDetails(thinking: string, summaryText: string | null): boolean {
  const normalizedThinking = normalizeThinkingComparisonText(thinking);
  if (!normalizedThinking) {
    return false;
  }

  if (!summaryText) {
    return true;
  }

  return normalizedThinking !== normalizeThinkingComparisonText(summaryText);
}

function normalizeThinkingComparisonText(value: string): string {
  return value
    .replace(/[*_`#>\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
