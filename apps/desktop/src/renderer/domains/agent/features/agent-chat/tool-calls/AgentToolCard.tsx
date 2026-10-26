import { Box, Collapse, IconButton, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { LuBot, LuPanelRightOpen } from "react-icons/lu";
import { DefaultToolCard } from "./DefaultToolCard";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { extractResultText } from "./diff";
import { getAgentStatusBadgeColor } from "./statusColors";
import type { AgentToolCallCardProps } from "./summary";

/** Renders the specialized Agent delegation tool-call card. */
export function AgentToolCard(props: AgentToolCallCardProps) {
  const {
    renderer,
    isError,
    agentLabel,
    agentStatusLabel,
    navigationTarget,
    result = null,
    onOpenCompletedSubagent,
  } = props;
  const resultText = extractResultText(result);
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"prompt" | "response">(resultText ? "response" : "prompt");
  const agentName = agentLabel;
  const agentPrompt = renderer.kind === "agent" ? renderer.prompt : null;
  const agentStatus = agentStatusLabel;
  const canOpenCompletedSubagent = Boolean(navigationTarget && onOpenCompletedSubagent);

  if (renderer.kind !== "agent") return <DefaultToolCard {...props} />;

  return (
    <ToolCardShell isError={isError}>
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
            noWrap
            sx={{
              color: "text.secondary",
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {agentPrompt}
          </Typography>
          {agentStatus ? <ToolSummaryBadge label={agentStatus} color={getAgentStatusBadgeColor(agentStatus)} /> : null}
          {canOpenCompletedSubagent && navigationTarget ? (
            <Tooltip title="Open sub-agent detail" placement="top">
              <IconButton
                aria-label={`Open sub-agent ${agentName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  // fire-and-forget: navigation is owned by the caller.
                  void onOpenCompletedSubagent?.(navigationTarget);
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
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block",
                  mb: 0.5,
                }}
              >
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
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block",
                  mb: 0.5,
                }}
              >
                response{isError ? " (error)" : ""}
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
                  color: isError ? "error.main" : undefined,
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
