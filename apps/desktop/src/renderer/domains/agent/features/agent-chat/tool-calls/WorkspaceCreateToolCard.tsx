import { Box, Collapse, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { LuFolderPlus } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolPathSummary } from "./ToolPathSummary";
import { extractResultText } from "./diff";
import type { AgentToolCallCardProps } from "./summary";

/** Renders the specialized workspace_create tool-call card. */
export function WorkspaceCreateToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const resultText = extractResultText(result);
  const isError = result?.isError === true;
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"arguments" | "response">(resultText ? "response" : "arguments");

  const branch = typeof toolCall.arguments.branch === "string" ? toolCall.arguments.branch : "";
  const projectId =
    typeof toolCall.arguments.projectId === "string" && toolCall.arguments.projectId.length > 0
      ? toolCall.arguments.projectId
      : null;
  const sourceBranch =
    typeof toolCall.arguments.sourceBranch === "string" && toolCall.arguments.sourceBranch.length > 0
      ? toolCall.arguments.sourceBranch
      : null;
  const workspaceName =
    typeof toolCall.arguments.name === "string" && toolCall.arguments.name.length > 0 ? toolCall.arguments.name : null;
  const taskRunPrompt =
    typeof toolCall.arguments.taskRunPrompt === "string" && toolCall.arguments.taskRunPrompt.length > 0
      ? toolCall.arguments.taskRunPrompt
      : null;
  const agentKind =
    typeof toolCall.arguments.taskRunAgentKind === "string" ? toolCall.arguments.taskRunAgentKind : null;

  // Collapsed summary
  const summaryLabel = branch || "new workspace";
  const resultIndicator = isError ? "✗ Failed" : resultText ? "✓ Created" : null;

  const suffix = (
    <>
      {projectId !== null && <ToolSummaryBadge label={projectId} color="primary.main" />}
      {sourceBranch !== null && <ToolSummaryBadge label={sourceBranch} color="text.secondary" />}
      {agentKind !== null && <ToolSummaryBadge label={agentKind} color="warning.main" />}
      {resultIndicator !== null && (
        <ToolSummaryBadge label={resultIndicator} color={isError ? "error.main" : "success.main"} />
      )}
    </>
  );
  const hasSuffix = projectId !== null || sourceBranch !== null || agentKind !== null || resultIndicator !== null;

  // Arguments for the expanded panel
  const argumentsEntries: [string, string][] = [
    ["branch", branch],
    ...(projectId ? [["projectId", projectId] as [string, string]] : []),
    ...(sourceBranch ? [["sourceBranch", sourceBranch] as [string, string]] : []),
    ...(workspaceName ? [["name", workspaceName] as [string, string]] : []),
    ...(taskRunPrompt ? [["taskRunPrompt", taskRunPrompt] as [string, string]] : []),
    ...(agentKind ? [["taskRunAgentKind", agentKind] as [string, string]] : []),
  ];

  return (
    <ToolCardShell isError={isError}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary icon={<LuFolderPlus size={14} />} path={summaryLabel} suffix={hasSuffix ? suffix : null} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <Collapse in={open}>
        <Box sx={{ bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
          <Tabs
            value={resultText ? selectedTab : "arguments"}
            onChange={(_, value: "arguments" | "response") => {
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
              label="Arguments"
              value="arguments"
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
          {selectedTab === "arguments" || !resultText ? (
            <Box data-testid="ws-create-arguments" sx={{ px: 1.5, py: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block",
                  mb: 0.5,
                }}
              >
                arguments
              </Typography>
              <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: 0.5 }}>
                {argumentsEntries.map(([key, value]) => (
                  <Box key={key} sx={{ display: "contents" }}>
                    <Typography
                      component="dt"
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        color: "text.secondary",
                        pr: 1,
                      }}
                    >
                      {key}
                    </Typography>
                    <Typography
                      component="dd"
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        m: 0,
                      }}
                    >
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}
          {resultText && selectedTab === "response" ? (
            <Box data-testid="ws-create-response" sx={{ px: 1.5, py: 1 }}>
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
