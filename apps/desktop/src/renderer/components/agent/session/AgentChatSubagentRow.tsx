import { Box, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import { LuBot, LuLoaderCircle, LuRefreshCw, LuTriangleAlert, LuX } from "react-icons/lu";
import type { RunningSubagentSummary } from "../../../features/agent/model/agentChatSubagents";
import type { AgentSubagentCancelState } from "../../../features/agent/model/agentChatTypes";

type AgentChatSubagentRowProps = {
  subagent: RunningSubagentSummary;
  isRunning?: boolean;
  /** True when the row is interrupted history (its owning process died). */
  isInterrupted?: boolean;
  canCancel?: boolean;
  cancelState?: AgentSubagentCancelState;
  onOpen: (subagent: RunningSubagentSummary) => void | Promise<void>;
  onCancel?: (subagent: RunningSubagentSummary) => void | Promise<void>;
};

/** Renders one compact running sub-agent row above the parent agent-chat composer. */
export function AgentChatSubagentRow({
  subagent,
  isRunning = false,
  isInterrupted = false,
  canCancel = false,
  cancelState,
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
          noWrap
          data-testid={`subagent-row-summary-${rowId}`}
          sx={{
            color: "text.secondary",
            minWidth: 0,
            flex: 1,
          }}
        >
          {subagent.promptSummary}
        </Typography>
        {isInterrupted ? (
          <Typography
            variant="caption"
            data-testid={`subagent-row-interrupted-${rowId}`}
            sx={{ color: "text.disabled", flexShrink: 0 }}
          >
            Interrupted
          </Typography>
        ) : null}
      </Box>
      {onCancel && !isInterrupted ? (
        <Tooltip title={cancelFeedbackTooltip(cancelState, canCancel)} placement="top">
          <span>
            <IconButton
              aria-label={`Cancel sub-agent ${subagent.agentName}`}
              disabled={isCancelUnavailable(cancelState, canCancel)}
              onClick={(event) => {
                event.stopPropagation();
                void onCancel?.(subagent);
              }}
              sx={{
                p: 0.5,
                border: 1,
                borderColor: cancelState?.status === "failed" ? "warning.main" : "divider",
                bgcolor: "background.paper",
                flexShrink: 0,
              }}
            >
              {cancelState?.status === "cancelling" ? (
                <Box
                  data-testid={`subagent-row-cancelling-icon-${rowId}`}
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
              ) : cancelState?.status === "failed" && cancelState.reason === "missing" ? (
                <LuTriangleAlert size={14} aria-hidden />
              ) : cancelState?.status === "failed" ? (
                <LuRefreshCw size={14} aria-hidden />
              ) : canCancel ? (
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

function isCancelUnavailable(cancelState: AgentSubagentCancelState | undefined, canCancel: boolean): boolean {
  if (cancelState?.status === "cancelling") {
    return true;
  }
  if (cancelState?.status === "failed" && cancelState.reason === "missing") {
    return true;
  }
  // A row without a live run id offers no target; keep it disabled until real
  // lifecycle metadata arrives instead of pretending a cancel could work.
  return !canCancel && cancelState === undefined;
}

function cancelFeedbackTooltip(cancelState: AgentSubagentCancelState | undefined, canCancel: boolean): string {
  if (cancelState?.status === "cancelling") {
    return "Cancelling sub-agent…";
  }
  if (cancelState?.status === "failed" && cancelState.reason === "missing") {
    return "No live run to cancel";
  }
  if (cancelState?.status === "failed") {
    return "Unable to interrupt sub-agent; click to retry";
  }
  return canCancel ? "Cancel sub-agent" : "Preparing sub-agent controls…";
}
