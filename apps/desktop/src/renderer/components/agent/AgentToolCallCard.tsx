import { Box, Collapse, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import type { AgentContentBlock, AgentMessage } from "../../store/agentChatTypes";

type AgentToolCallCardProps = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
};

function extractResultText(message: AgentMessage | null | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((block): block is Extract<AgentContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** Renders a tool call block with expandable arguments or output. */
export function AgentToolCallCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const isBash = toolCall.name === "bash";
  const isRead = toolCall.name === "read";
  const command = typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : null;
  const readPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);
  const resultText = extractResultText(result);

  return (
    <Box
      sx={{
        mb: 0.5,
        border: isBash || isRead ? 0 : 1,
        borderColor: result?.isError ? "error.main" : "primary.main",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      {!isBash && !isRead && (
        <Box
          onClick={() => setOpen(!open)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 0.75,
            cursor: "pointer",
            bgcolor: result?.isError ? "error.main" : "primary.main",
            color: result?.isError ? "error.contrastText" : "primary.contrastText",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
            {toolCall.name}
          </Typography>
          <IconButton size="small" sx={{ ml: "auto", color: "inherit", width: 20, height: 20 }}>
            {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
          </IconButton>
        </Box>
      )}
      <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}>
        {isBash && command ? (
          <Box
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
                flex: 1,
                color: "primary.main",
              }}
            >
              $ {command}
            </Typography>
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : isRead && readPath ? (
          <Typography
            variant="body2"
            component="pre"
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              m: 0,
              color: "primary.main",
            }}
          >
            READ: {readPath}
          </Typography>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              arguments
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
              }}
            >
              {argsStr}
            </Typography>
          </>
        )}
      </Box>
      {resultText && !isRead && (
        <Collapse in={open}>
          <Box sx={{ px: 1.5, py: 1, bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              output{result?.isError ? " (error)" : ""}
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
                maxHeight: 200,
                overflow: "auto",
                color: result?.isError ? "error.main" : undefined,
              }}
            >
              {resultText}
            </Typography>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}
