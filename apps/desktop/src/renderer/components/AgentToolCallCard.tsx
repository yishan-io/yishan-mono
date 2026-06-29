import { Box, Collapse, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import type { AgentContentBlock } from "../store/agentChatTypes";

type AgentToolCallCardProps = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
};

/** Renders a tool call block with expandable arguments. */
export function AgentToolCallCard({ toolCall }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);

  return (
    <Box
      sx={{
        mb: 0.5,
        border: 1,
        borderColor: "primary.main",
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
          bgcolor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
          {toolCall.name}
        </Typography>
        <IconButton size="small" sx={{ ml: "auto", color: "inherit", fontSize: "0.75rem", width: 20, height: 20 }}>
          {open ? "▲" : "▼"}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}>
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
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {argsStr}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
}
