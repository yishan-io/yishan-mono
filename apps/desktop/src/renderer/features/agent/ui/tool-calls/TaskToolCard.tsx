import { Box, Collapse, Typography } from "@mui/material";
import { useState } from "react";
import { LuListChecks } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";

type TaskToolName = "task_start" | "task_list" | "task_read" | "task_write" | "task_append_note" | "task_finish";

interface TaskSummary {
  label: string;
  badge?: { text: string; color: string };
}

function buildTaskSummary(toolName: string, args: Record<string, unknown>): TaskSummary {
  switch (toolName as TaskToolName) {
    case "task_start": {
      const title = typeof args.title === "string" ? args.title : "new task";
      return { label: title, badge: { text: "start", color: "success.main" } };
    }
    case "task_list": {
      const status = typeof args.status === "string" ? args.status : null;
      return { label: "List tasks", badge: status ? { text: status, color: "info.main" } : undefined };
    }
    case "task_read": {
      const id = typeof args.id === "string" ? args.id : "?";
      const document = typeof args.document === "string" ? args.document : null;
      return { label: id, badge: document ? { text: document, color: "secondary.main" } : undefined };
    }
    case "task_write": {
      const id = typeof args.id === "string" ? args.id : "?";
      const document = typeof args.document === "string" ? args.document : null;
      return { label: id, badge: document ? { text: document, color: "primary.main" } : undefined };
    }
    case "task_append_note": {
      const id = typeof args.id === "string" ? args.id : "?";
      return { label: id, badge: { text: "note", color: "warning.main" } };
    }
    case "task_finish": {
      const id = typeof args.id === "string" ? args.id : "?";
      return { label: id, badge: { text: "finish", color: "warning.main" } };
    }
    default:
      return { label: toolName };
  }
}

function buildArgumentsEntries(toolName: string, args: Record<string, unknown>): [string, string][] {
  switch (toolName as TaskToolName) {
    case "task_start": {
      const entries: [string, string][] = [];
      if (typeof args.title === "string") entries.push(["title", args.title]);
      if (typeof args.id === "string") entries.push(["id", args.id]);
      if (typeof args.ticket === "string") entries.push(["ticket", args.ticket]);
      if (typeof args.goal === "string") entries.push(["goal", args.goal]);
      if (typeof args.created === "string") entries.push(["created", args.created]);
      if (Array.isArray(args.acceptanceCriteria) && args.acceptanceCriteria.length > 0) {
        entries.push(["acceptanceCriteria", args.acceptanceCriteria.join(", ")]);
      }
      return entries;
    }
    case "task_list": {
      const entries: [string, string][] = [];
      if (typeof args.status === "string") entries.push(["status", args.status]);
      return entries;
    }
    case "task_read": {
      const entries: [string, string][] = [];
      if (typeof args.id === "string") entries.push(["id", args.id]);
      if (typeof args.document === "string") entries.push(["document", args.document]);
      return entries;
    }
    case "task_write": {
      const entries: [string, string][] = [];
      if (typeof args.id === "string") entries.push(["id", args.id]);
      if (typeof args.document === "string") entries.push(["document", args.document]);
      // content is typically long — show truncated preview
      if (typeof args.content === "string") {
        entries.push(["content", args.content.length > 200 ? `${args.content.slice(0, 200)}…` : args.content]);
      }
      return entries;
    }
    case "task_append_note": {
      const entries: [string, string][] = [];
      if (typeof args.id === "string") entries.push(["id", args.id]);
      if (typeof args.date === "string") entries.push(["date", args.date]);
      if (typeof args.content === "string") {
        entries.push(["content", args.content.length > 200 ? `${args.content.slice(0, 200)}…` : args.content]);
      }
      return entries;
    }
    case "task_finish": {
      const entries: [string, string][] = [];
      if (typeof args.id === "string") entries.push(["id", args.id]);
      if (typeof args.completed === "string") entries.push(["completed", args.completed]);
      if (typeof args.outcome === "string") {
        entries.push(["outcome", args.outcome.length > 200 ? `${args.outcome.slice(0, 200)}…` : args.outcome]);
      }
      return entries;
    }
    default:
      return [];
  }
}

function trimToolName(name: string): string {
  return name.startsWith("task_") ? name.slice(5) : name;
}

/** Renders the specialized task tool-call card for all six task_* tools. */
export function TaskToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const isError = result?.isError === true;

  const summary = buildTaskSummary(toolCall.name, toolCall.arguments);
  const argEntries = buildArgumentsEntries(toolCall.name, toolCall.arguments);
  const shortName = trimToolName(toolCall.name);

  const suffix = summary.badge ? <ToolSummaryBadge label={summary.badge.text} color={summary.badge.color} /> : null;

  const hasExpandableContent = argEntries.length > 0 || !!resultText;

  return (
    <ToolCardShell isError={isError}>
      <ToolSummaryPanel>
        {hasExpandableContent ? (
          <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open} testId="task-tool-summary">
            <ToolPathSummary icon={<LuListChecks size={14} />} path={summary.label} suffix={suffix} />
          </ToolExpandableSummary>
        ) : (
          <ToolPathSummary icon={<LuListChecks size={14} />} path={summary.label} suffix={suffix} />
        )}
      </ToolSummaryPanel>
      <Collapse in={open}>
        {argEntries.length > 0 && (
          <Box sx={{ bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
            <Box data-testid="task-tool-arguments" sx={{ px: 1.5, py: 1 }}>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
                {shortName}
              </Typography>
              <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: 0.5 }}>
                {argEntries.map(([key, value]) => (
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
          </Box>
        )}
        <ToolOutputSection open={open} resultText={resultText} isError={isError} />
      </Collapse>
    </ToolCardShell>
  );
}
