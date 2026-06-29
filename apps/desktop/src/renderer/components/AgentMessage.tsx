import { Box, Collapse, IconButton, Paper, Typography } from "@mui/material";
import { useState } from "react";
import type { AgentMessage as AgentMessageType } from "../store/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

type AgentMessageProps = {
  message: AgentMessageType;
};

/** Renders a single agent conversation message with support for text, thinking, and tool calls. */
export function AgentMessage({ message }: AgentMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isToolResult = message.role === "toolResult";
  const blocks = Array.isArray(message.content) ? message.content : [];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: isToolResult ? "95%" : "80%",
        bgcolor: isToolResult ? "action.hover" : "background.paper",
      }}
    >
      {isUser && (
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {typeof message.content === "string" ? message.content : ""}
        </Typography>
      )}

      {isAssistant &&
        blocks.map((block, i) => {
          switch (block.type) {
            case "text":
              return (
                <Typography key={i} variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 0.5 }}>
                  {block.text}
                </Typography>
              );
            case "thinking":
              return <ThinkingBlock key={i} thinking={block.thinking} />;
            case "toolCall":
              return <AgentToolCallCard key={block.id || i} toolCall={block} />;
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
            {typeof message.content === "string" ? message.content : ""}
          </Typography>
        </Box>
      )}

      {message.usage && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
          ↑{message.usage.input} ↓{message.usage.output}
        </Typography>
      )}
    </Paper>
  );
}

function ThinkingBlock({ thinking }: { thinking: string }) {
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
          thinking
        </Typography>
        <IconButton size="small" sx={{ ml: "auto", fontSize: "0.75rem", width: 20, height: 20 }}>
          {open ? "▲" : "▼"}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", px: 1, py: 0.5, color: "text.secondary" }}>
          {thinking}
        </Typography>
      </Collapse>
    </Box>
  );
}
