import { useState } from "react";
import { LuFolderSearch } from "react-icons/lu";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";

/** Renders the specialized workspace_find tool-call card. */
export function WorkspaceFindToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const workspaceId =
    typeof toolCall.arguments.workspaceId === "string" ? toolCall.arguments.workspaceId : "workspace";

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary icon={<LuFolderSearch size={14} />} path={workspaceId} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="workspace" />
    </ToolCardShell>
  );
}
