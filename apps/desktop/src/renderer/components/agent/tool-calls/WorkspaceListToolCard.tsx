import { useMemo, useState } from "react";
import { LuLayoutGrid } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText, parseWorkspaceListCount } from "./helpers";

/** Renders the specialized workspace_list tool-call card. */
export function WorkspaceListToolCard({ toolCall: _toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const workspaceCount = useMemo(() => parseWorkspaceListCount(resultText), [resultText]);
  const countLabel =
    workspaceCount === null
      ? null
      : workspaceCount === 0
        ? "no workspaces"
        : `${workspaceCount} workspace${workspaceCount !== 1 ? "s" : ""}`;

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary
            icon={<LuLayoutGrid size={14} />}
            path="list workspaces"
            suffix={countLabel !== null ? <ToolSummaryBadge label={countLabel} color="info.main" /> : null}
          />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="workspaces" />
    </ToolCardShell>
  );
}
