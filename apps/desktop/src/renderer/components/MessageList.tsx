import { Box, ButtonBase, Paper, Typography } from "@mui/material";
import type { ChatMessage } from "../store/chatTypes";

export type Message = ChatMessage;

type MessageListProps = {
  messages: Message[];
  emptyState?: {
    prompt: string;
    summary: string;
  };
  minHeight?: number;
};

export function MessageList({ messages, emptyState, minHeight = 320 }: MessageListProps) {
  if (messages.length === 0 && emptyState) {
    return (
      <Box sx={{ minHeight }}>
        <Typography variant="body1" color="text.secondary">
          {emptyState.prompt}
        </Typography>
        <ButtonBase
          sx={{
            mt: 1,
            px: 1.25,
            py: 0.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "background.paper",
            typography: "body2",
            color: "text.secondary",
          }}
        >
          {emptyState.summary}
        </ButtonBase>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minHeight }}>
      {messages.map((message) => (
        <Paper
          key={message.id}
          sx={{
            p: 1.5,
            alignSelf: message.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "80%",
          }}
          variant="outlined"
        >
          <Typography variant="caption" color="text.secondary">
            {message.role}
          </Typography>
          {message.thinking && message.thinking.trim().length > 0 ? (
            <Box
              sx={{
                mt: 0.5,
                mb: 1,
                px: 1,
                py: 0.75,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "action.hover",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                thinking
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {message.thinking}
              </Typography>
            </Box>
          ) : null}
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{message.content}</Typography>
        </Paper>
      ))}
    </Box>
  );
}
