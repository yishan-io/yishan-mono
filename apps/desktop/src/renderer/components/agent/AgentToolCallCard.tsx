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
  const command = typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : null;
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);
  const resultText = extractResultText(result);

  return (
    <Box
      sx={{
        mb: 0.5,
        border: 1,
        borderColor: result?.isError ? "error.main" : "primary.main",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
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
      <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}>
        {isBash && command ? (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              command
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
              {command}
            </Typography>
          </>
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
      {resultText && (
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
