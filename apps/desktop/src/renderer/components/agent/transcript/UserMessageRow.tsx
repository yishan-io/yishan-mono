import { Box, Paper, Typography } from "@mui/material";
import type { AgentMessage } from "../../../store/agentChatTypes";
import { UserMessageContent } from "./UserMessageContent";
import { extractMessageText } from "./helpers";

type UserMessageRowProps = {
  message: AgentMessage;
};

/**
 * Standalone user message card, unchanged from the pre-turn transcript:
 * highlighted background with the left accent border, plus the human-readable
 * timestamp when one is recorded. Never part of a collapsible turn.
 */
export function UserMessageRow({ message }: UserMessageRowProps) {
  const messageText = extractMessageText(message.content);
  const humanTimestamp = typeof message.timestamp === "number" ? formatHumanMessageTime(message.timestamp) : null;

  return (
    <Paper
      elevation={0}
      data-testid="user-message-row"
      sx={{
        p: 1.5,
        width: "100%",
        bgcolor: "action.selected",
        borderLeft: 3,
        borderColor: "info.main",
        borderRadius: 1,
      }}
    >
      <UserMessageContent messageText={messageText} />
      {humanTimestamp ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            mt: 0.5,
            display: "block",
          }}
        >
          {humanTimestamp}
        </Typography>
      ) : null}
    </Paper>
  );
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
