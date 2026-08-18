import { useMemo, useState } from "react";
import { LuLayoutGrid } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText, parseWorkspaceListCount } from "./helpers";

/** Renders the specialized workspace_list tool-call card. */
export function WorkspaceListToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const workspaceCount = useMemo(() => parseWorkspaceListCount(resultText), [resultText]);
  const countLabel =
    workspaceCount === null
      ? null
      : workspaceCount === 0
        ? "no workspaces"
        : `${workspaceCount} workspace${workspaceCount !== 1 ? "s" : ""}`;
  const projectId =
    typeof toolCall.arguments.projectId === "string" && toolCall.arguments.projectId.length > 0
      ? toolCall.arguments.projectId
      : null;

  // When result is available, show the count in the path; otherwise show the action.
  const summaryLabel = countLabel !== null ? countLabel : "list workspaces";

  const suffix = projectId !== null ? <ToolSummaryBadge label={projectId} color="primary.main" /> : null;

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary icon={<LuLayoutGrid size={14} />} path={summaryLabel} suffix={suffix} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="workspaces" />
    </ToolCardShell>
  );
}
