import { Box, Chip, LinearProgress, Typography } from "@mui/material";
import type { AgentQueueState, AgentSessionState } from "../../../store/agentChatTypes";

type AgentSessionBarProps = {
  state: AgentSessionState;
  modelName: string;
  thinkingLevel: string;
  queue: AgentQueueState;
  error: string | null;
};

const STATE_LABELS: Record<AgentSessionState, string> = {
  starting: "Starting…",
  running: "Running",
  idle: "Ready",
  error: "Error",
};

const STATE_COLORS: Record<AgentSessionState, "info" | "success" | "warning" | "error"> = {
  starting: "info",
  running: "info",
  idle: "success",
  error: "error",
};

/** Status bar for an agent session showing model, state, and queue info. */
export function AgentSessionBar({ state, modelName, thinkingLevel, queue, error }: AgentSessionBarProps) {
  const isStreaming = state === "running";

  return (
    <Box>
      {isStreaming && <LinearProgress sx={{ mb: 0.5 }} />}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5, flexWrap: "wrap" }}>
        <Chip
          label={modelName || "No model"}
          size="small"
          variant="outlined"
          sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
        />
        {thinkingLevel && thinkingLevel !== "off" && (
          <Chip label={thinkingLevel} size="small" color="secondary" variant="outlined" />
        )}
        <Chip
          label={error ?? STATE_LABELS[state]}
          size="small"
          color={STATE_COLORS[state]}
          variant={state === "error" ? "filled" : "outlined"}
        />
        {(queue.steering.length > 0 || queue.followUp.length > 0) && (
          <Typography variant="caption" color="text.secondary">
            {queue.steering.length + queue.followUp.length} queued
          </Typography>
        )}
      </Box>
    </Box>
  );
}
