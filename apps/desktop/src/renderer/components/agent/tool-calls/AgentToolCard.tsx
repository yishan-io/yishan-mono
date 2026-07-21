import { Box, Collapse, IconButton, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { LuBot, LuPanelRightOpen } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { type AgentToolCallCardProps, extractResultText, getAgentStatusBadgeColor } from "./helpers";

/** Renders the specialized Agent delegation tool-call card. */
export function AgentToolCard({ toolCall, result = null, onOpenCompletedSubagent }: AgentToolCallCardProps) {
  const resultText = extractResultText(result);
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"prompt" | "response">(resultText ? "response" : "prompt");
  const agentName = typeof toolCall.arguments.agent === "string" ? toolCall.arguments.agent : null;
  const agentPrompt = typeof toolCall.arguments.prompt === "string" ? toolCall.arguments.prompt : null;
  const agentStatus = typeof result?.details?.status === "string" ? result.details.status : null;
  const childSessionId = typeof result?.details?.sessionId === "string" ? result.details.sessionId : null;
  const agentId = typeof result?.details?.agentId === "string" ? result.details.agentId : undefined;
  const canOpenCompletedSubagent =
    agentStatus === "completed" && Boolean(childSessionId) && Boolean(onOpenCompletedSubagent);

  if (!agentName || !agentPrompt) {
    return null;
  }

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open} testId="agent-tool-summary">
          <Box component="span" aria-hidden sx={{ display: "inline-flex", alignItems: "center", opacity: 0.8 }}>
            <LuBot size={14} />
          </Box>
          <Typography variant="body2" sx={{ color: "warning.main", fontWeight: 600, flexShrink: 0 }}>
            {agentName}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap
            sx={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {agentPrompt}
          </Typography>
          {agentStatus ? <ToolSummaryBadge label={agentStatus} color={getAgentStatusBadgeColor(agentStatus)} /> : null}
          {canOpenCompletedSubagent && childSessionId ? (
            <Tooltip title="Open sub-agent detail" placement="top">
              <IconButton
                size="small"
                aria-label={`Open sub-agent ${agentName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onOpenCompletedSubagent?.({
                    agentId,
                    childSessionId,
                    title: `${agentName} — ${agentPrompt}`,
                  });
                }}
                sx={{ p: 0.5 }}
              >
                <LuPanelRightOpen size={14} />
              </IconButton>
            </Tooltip>
          ) : null}
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <Collapse in={open}>
        <Box sx={{ bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
          <Tabs
            value={resultText ? selectedTab : "prompt"}
            onChange={(_, value: "prompt" | "response") => {
              setSelectedTab(value);
            }}
            sx={{
              minHeight: 28,
              borderBottom: 1,
              borderColor: "divider",
              px: 0.5,
              alignItems: "flex-start",
              "& .MuiTabs-flexContainer": {
                gap: 0.5,
              },
            }}
          >
            <Tab
              label="Prompt"
              value="prompt"
              sx={{ minHeight: 28, minWidth: 0, px: 1, py: 0.5, textTransform: "none", fontSize: "0.75rem" }}
            />
            {resultText ? (
              <Tab
                label="Response"
                value="response"
                sx={{ minHeight: 28, minWidth: 0, px: 1, py: 0.5, textTransform: "none", fontSize: "0.75rem" }}
              />
            ) : null}
          </Tabs>
          {selectedTab === "prompt" || !resultText ? (
            <Box data-testid="agent-tool-prompt" sx={{ px: 1.5, py: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                prompt
              </Typography>
              <Typography
                variant="body2"
                component="pre"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  whiteSpace: "pre-wrap",
                  m: 0,
                }}
              >
                {agentPrompt}
              </Typography>
            </Box>
          ) : null}
          {resultText && selectedTab === "response" ? (
            <Box data-testid="agent-tool-response" sx={{ px: 1.5, py: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                response{result?.isError ? " (error)" : ""}
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
                  color: result?.isError ? "error.main" : undefined,
                }}
              >
                {resultText}
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Collapse>
    </ToolCardShell>
  );
}
