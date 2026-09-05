import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { LuBot, LuPanelRightOpen } from "react-icons/lu";
import { getDshDelegationMetadata, getDshDelegationRole } from "../../../chat/agentChatDshDelegation";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import type { AgentToolCallCardProps } from "./summary";

/** Renders one fixed-role DSH delegation without inspecting model-facing text. */
export function DshSubagentToolCard({
  toolCall,
  result = null,
  dshDelegationState,
  dshDelegationDiagnostic,
  onOpenCompletedSubagent,
}: AgentToolCallCardProps) {
  const role = getDshDelegationRole(toolCall.name);
  const task = typeof toolCall.arguments.task === "string" ? toolCall.arguments.task : null;
  const metadata = result ? getDshDelegationMetadata(result) : null;
  const state = dshDelegationState ?? (result?.isError ? "error" : "queued");
  if (!role || !task) return null;
  const canOpen = state === "completed" && Boolean(metadata && onOpenCompletedSubagent);
  return (
    <ToolCardShell isError={state === "error"}>
      <ToolSummaryPanel>
        <Box data-testid="dsh-subagent-tool-summary" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box component="span" aria-hidden sx={{ display: "inline-flex", alignItems: "center", opacity: 0.8 }}>
            <LuBot size={14} />
          </Box>
          <Typography variant="body2" sx={{ color: "warning.main", fontWeight: 600, flexShrink: 0 }}>
            {role}
          </Typography>
          <Typography
            variant="body2"
            noWrap
            sx={{ color: "text.secondary", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {task}
          </Typography>
          <ToolSummaryBadge
            label={state}
            color={state === "error" ? "error" : state === "completed" ? "success" : "info"}
          />
          {dshDelegationDiagnostic && (state === "error" || state === "aborted") ? (
            <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
              {getTerminalDiagnosticLabel(dshDelegationDiagnostic.reason)}
            </Typography>
          ) : null}
          {canOpen && metadata ? (
            <Tooltip title="Open sub-agent detail" placement="top">
              <IconButton
                aria-label={`Open sub-agent ${role}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onOpenCompletedSubagent?.({
                    childSessionId: metadata.childSessionId,
                    title: `${role} — ${task}`,
                    runtime: "dsh",
                  });
                }}
                sx={{ p: 0.5 }}
              >
                <LuPanelRightOpen size={14} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      </ToolSummaryPanel>
    </ToolCardShell>
  );
}

function getTerminalDiagnosticLabel(reason: "aborted" | "error" | "max-tokens" | "refusal"): string {
  switch (reason) {
    case "aborted":
      return "subagent aborted";
    case "max-tokens":
      return "maximum token limit reached";
    case "refusal":
      return "subagent refused the task";
    case "error":
      return "subagent failed";
  }
}
