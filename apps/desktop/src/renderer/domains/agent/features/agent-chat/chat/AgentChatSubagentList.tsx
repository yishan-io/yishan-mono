import { Box, Typography } from "@mui/material";
import type { RunningSubagentSummary } from "../../../chat/agentChatSubagents";
import type { AgentSubagentCancelState } from "../../../chat/agentChatTypes";
import { AgentChatSubagentRow } from "../session/AgentChatSubagentRow";

export type AgentChatSubagentListProps = {
  runningSubagents: RunningSubagentSummary[];
  subagentSessionEndedAtMs: number | null;
  subagentProgressTargets: Array<{ agentName: string }>;
  subagentCancelStates: Record<string, AgentSubagentCancelState | undefined>;
  onOpenSubagent: (subagent: RunningSubagentSummary) => void | Promise<void>;
  onCancelSubagent?: (subagent: RunningSubagentSummary) => void | Promise<void>;
};

/** Renders the running sub-agent rows above the composer input. */
export function AgentChatSubagentList({
  runningSubagents,
  subagentSessionEndedAtMs,
  subagentProgressTargets,
  subagentCancelStates,
  onOpenSubagent,
  onCancelSubagent,
}: AgentChatSubagentListProps) {
  if (runningSubagents.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        px: 0.5,
        py: 0.25,
        borderRadius: 1,
        bgcolor: "action.hover",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          px: 0.5,
          fontWeight: 700,
        }}
      >
        Sub-agents
      </Typography>
      {runningSubagents.map((subagent) => {
        // DSH rows come from the authoritative, unsettled child lifecycle snapshot.
        // Pi history has no equivalent child lifecycle, so retain its parent-end overlay.
        const isInterrupted =
          subagent.runtime !== "dsh" &&
          subagentSessionEndedAtMs !== null &&
          (subagent.startedAtMs ?? 0) < subagentSessionEndedAtMs;
        const hasUniqueLiveTarget =
          subagentProgressTargets.filter((target) => target.agentName === subagent.agentName).length === 1;
        const canCancel =
          subagent.state === "running" &&
          !isInterrupted &&
          (subagent.runtime === "dsh"
            ? Boolean(subagent.childSessionId)
            : Boolean(subagent.agentId || subagent.childSessionId || hasUniqueLiveTarget));

        return (
          <AgentChatSubagentRow
            key={subagent.rowId}
            subagent={subagent}
            isInterrupted={isInterrupted}
            canCancel={canCancel}
            cancelState={subagentCancelStates[subagent.childSessionId ?? subagent.rowId]}
            onOpen={onOpenSubagent}
            onCancel={onCancelSubagent}
          />
        );
      })}
    </Box>
  );
}
