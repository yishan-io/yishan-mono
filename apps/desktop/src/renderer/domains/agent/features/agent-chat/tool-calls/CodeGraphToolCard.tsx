import { Box } from "@mui/material";
import { useState } from "react";
import { PiGraphLight } from "react-icons/pi";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { extractResultText } from "./diff";
import type { AgentToolCallCardProps } from "./summary";

type CodeGraphToolSummary = {
  argumentKeys: readonly string[];
  label: string;
  subject?: string;
};

const CODEGRAPH_TOOL_SUMMARIES: Record<string, CodeGraphToolSummary> = {
  codegraph_search: { label: "search", argumentKeys: ["query"] },
  codegraph_callers: { label: "callers", argumentKeys: ["symbol"] },
  codegraph_callees: { label: "callees", argumentKeys: ["symbol"] },
  codegraph_impact: { label: "impact", argumentKeys: ["symbol"] },
  codegraph_explore: { label: "explore", argumentKeys: ["query"] },
  codegraph_node: { label: "node", argumentKeys: ["symbol"] },
  codegraph_status: { label: "status", argumentKeys: [], subject: "index status" },
  codegraph_files: { label: "files", argumentKeys: ["path"] },
};

/** Renders a compact, expandable card for all CodeGraph agent tools. */
export function CodeGraphToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const summary = CODEGRAPH_TOOL_SUMMARIES[toolCall.name];
  const resultText = extractResultText(result);
  const target = summary ? getCodeGraphTarget(toolCall.arguments, summary) : null;
  const projectPath = getNonEmptyString(toolCall.arguments.projectPath);
  const label = summary?.label ?? "tool";
  const badges = getCodeGraphBadges(toolCall.name, toolCall.arguments);

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary testId="codegraph-tool-card" onToggle={() => setOpen(!open)} open={open}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0, flex: 1 }}>
            <ToolPathSummary
              icon={<PiGraphLight size={14} />}
              path={target ?? `CodeGraph ${label}`}
              suffix={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
                  <ToolSummaryBadge label={label} color="info.main" />
                  {badges.map((badge) => (
                    <ToolSummaryBadge key={badge} label={badge} color="text.secondary" />
                  ))}
                </Box>
              }
            />
            {projectPath ? (
              <Box data-testid="codegraph-project-path">
                <ToolPathSummary
                  icon={<Box sx={{ width: 14 }} />}
                  path={projectPath}
                  suffix={<ToolSummaryBadge label="project" color="text.secondary" />}
                />
              </Box>
            ) : null}
          </Box>
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="result" />
    </ToolCardShell>
  );
}

function getCodeGraphTarget(argumentsValue: Record<string, unknown>, summary: CodeGraphToolSummary): string | null {
  if (summary.subject) {
    return summary.subject;
  }

  for (const argumentKey of summary.argumentKeys) {
    const argument = getNonEmptyString(argumentsValue[argumentKey]);
    if (argument) {
      return argument;
    }
  }
  return null;
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const CODEGRAPH_SEARCH_KINDS = new Set([
  "function",
  "method",
  "class",
  "interface",
  "type",
  "variable",
  "route",
  "component",
]);
const CODEGRAPH_FILE_FORMATS = new Set(["tree", "flat", "grouped"]);

function getCodeGraphBadges(toolName: string, argumentsValue: Record<string, unknown>): string[] {
  switch (toolName) {
    case "codegraph_search":
      return [
        getAllowedStringBadge("kind", argumentsValue.kind, CODEGRAPH_SEARCH_KINDS),
        getPositiveNumberBadge("limit", argumentsValue.limit),
      ].filter(isNonNull);
    case "codegraph_callers":
    case "codegraph_callees":
      return [getPositiveNumberBadge("limit", argumentsValue.limit)].filter(isNonNull);
    case "codegraph_impact":
      return [getPositiveNumberBadge("depth", argumentsValue.depth)].filter(isNonNull);
    case "codegraph_explore":
      return [getPositiveNumberBadge("maxFiles", argumentsValue.maxFiles)].filter(isNonNull);
    case "codegraph_node":
      return argumentsValue.includeCode === true ? ["includeCode"] : [];
    case "codegraph_files":
      return [
        getAllowedStringBadge("format", argumentsValue.format, CODEGRAPH_FILE_FORMATS),
        getNonEmptyStringBadge("pattern", argumentsValue.pattern),
        getPositiveNumberBadge("maxDepth", argumentsValue.maxDepth),
      ].filter(isNonNull);
    default:
      return [];
  }
}

function getAllowedStringBadge(label: string, value: unknown, allowedValues: Set<string>): string | null {
  return typeof value === "string" && allowedValues.has(value) ? `${label}: ${value}` : null;
}

function getNonEmptyStringBadge(label: string, value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? `${label}: ${value.trim()}` : null;
}

function getPositiveNumberBadge(label: string, value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? `${label}: ${value}` : null;
}

function isNonNull(value: string | null): value is string {
  return value !== null;
}
