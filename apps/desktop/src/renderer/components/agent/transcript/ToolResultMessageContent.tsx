import { Box, Typography } from "@mui/material";
import type { AgentMessage } from "../../../store/agentChatTypes";
import { extractMessageText } from "./helpers";

type ToolResultMessageContentProps = {
  message: AgentMessage;
};

/** Renders a standalone tool result message when it is not merged into a tool-call card. */
export function ToolResultMessageContent({ message }: ToolResultMessageContentProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {message.toolName ?? "tool"}
        {message.isError ? " (error)" : ""}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          mt: 0.5,
          color: message.isError ? "error.main" : undefined,
        }}
      >
        {extractMessageText(message.content)}
      </Typography>
    </Box>
  );
}
