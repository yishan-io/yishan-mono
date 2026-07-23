import { useState } from "react";
import { LuFolderX } from "react-icons/lu";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";

/** Renders the specialized workspace_close tool-call card. */
export function WorkspaceCloseToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const workspaceId =
    typeof toolCall.arguments.workspaceId === "string" ? toolCall.arguments.workspaceId : "workspace";

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary icon={<LuFolderX size={14} />} path={workspaceId} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="workspace" />
    </ToolCardShell>
  );
}
