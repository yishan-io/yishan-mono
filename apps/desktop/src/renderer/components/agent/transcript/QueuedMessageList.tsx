import { Box, Paper, Typography } from "@mui/material";
import { LuClock } from "react-icons/lu";

const MAX_DISPLAY_LENGTH = 120;

type QueuedMessageListProps = {
  steering: string[];
  followUp: string[];
};

function truncate(text: string): string {
  return text.length > MAX_DISPLAY_LENGTH ? `${text.slice(0, MAX_DISPLAY_LENGTH)}…` : text;
}

/** Renders queued steering and follow-up messages as muted pending user message rows. */
export function QueuedMessageList({ steering, followUp }: QueuedMessageListProps) {
  const items = [...steering, ...followUp];

  if (items.length === 0) {
    return null;
  }

  return (
    <Box data-testid="queued-message-list">
      {items.map((text, index) => (
        <Paper
          // biome-ignore lint/suspicious/noArrayIndexKey: queue items have no stable id
          key={index}
          elevation={0}
          sx={{
            p: 1.5,
            width: "100%",
            borderRadius: 0,
            bgcolor: "action.selected",
            opacity: 0.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
            <LuClock size={12} />
            <Typography variant="caption" color="text.secondary">
              Queued
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
            {truncate(text)}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}
