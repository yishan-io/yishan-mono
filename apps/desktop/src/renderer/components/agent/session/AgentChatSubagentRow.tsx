import { Box, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import { LuBot, LuLoaderCircle, LuX } from "react-icons/lu";
import type { RunningSubagentSummary } from "../../../store/agentChatSubagents";

type AgentChatSubagentRowProps = {
  subagent: RunningSubagentSummary;
  isRunning?: boolean;
  canCancel?: boolean;
  onOpen: (subagent: RunningSubagentSummary) => void | Promise<void>;
  onCancel?: (subagent: RunningSubagentSummary) => void | Promise<void>;
};

/** Renders one compact running sub-agent row above the parent agent-chat composer. */
export function AgentChatSubagentRow({
  subagent,
  isRunning = false,
  canCancel = false,
  onOpen,
  onCancel,
}: AgentChatSubagentRowProps) {
  const rowId = subagent.childSessionId ?? subagent.rowId;

  return (
    <Paper
      elevation={0}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1,
        py: 0.75,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box
        component="button"
        type="button"
        data-testid={`subagent-row-button-${rowId}`}
        onClick={() => {
          void onOpen(subagent);
        }}
        sx={{
          appearance: "none",
          border: 0,
          background: "transparent",
          padding: 0,
          margin: 0,
          minWidth: 0,
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
        }}
      >
        {isRunning ? (
          <Tooltip title="Sub-agent running" placement="top">
            <Box
              component="span"
              data-testid={`subagent-row-running-icon-${rowId}`}
              aria-label="Sub-agent running"
              sx={{
                display: "inline-flex",
                color: "primary.main",
                animation: "subagent-row-spin 1s linear infinite",
                "@keyframes subagent-row-spin": {
                  from: { transform: "rotate(0deg)" },
                  to: { transform: "rotate(360deg)" },
                },
              }}
            >
              <LuLoaderCircle size={14} aria-hidden />
            </Box>
          </Tooltip>
        ) : null}
        <LuBot size={16} aria-hidden />
        <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
          {subagent.agentName}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          data-testid={`subagent-row-summary-${rowId}`}
          sx={{ minWidth: 0, flex: 1 }}
        >
          {subagent.promptSummary}
        </Typography>
      </Box>
      {onCancel ? (
        <Tooltip title={canCancel ? "Cancel sub-agent" : "Preparing sub-agent controls…"} placement="top">
          <span>
            <IconButton
              size="small"
              aria-label={`Cancel sub-agent ${subagent.agentName}`}
              disabled={!canCancel}
              onClick={(event) => {
                event.stopPropagation();
                void onCancel?.(subagent);
              }}
              sx={{
                p: 0.5,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                flexShrink: 0,
              }}
            >
              {canCancel ? (
                <LuX size={14} />
              ) : (
                <Box
                  data-testid={`subagent-row-preparing-icon-${rowId}`}
                  sx={{
                    display: "inline-flex",
                    animation: "subagent-row-spin 1s linear infinite",
                    "@keyframes subagent-row-spin": {
                      from: { transform: "rotate(0deg)" },
                      to: { transform: "rotate(360deg)" },
                    },
                  }}
                >
                  <LuLoaderCircle size={14} />
                </Box>
              )}
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
    </Paper>
  );
}
