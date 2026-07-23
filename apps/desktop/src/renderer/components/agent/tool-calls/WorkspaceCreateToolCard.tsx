import { useState } from "react";
import { LuFolderPlus } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";

/** Renders the specialized workspace_create tool-call card. */
export function WorkspaceCreateToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const branch = typeof toolCall.arguments.branch === "string" ? toolCall.arguments.branch : "new workspace";
  const agentKind =
    typeof toolCall.arguments.taskRunAgentKind === "string" ? toolCall.arguments.taskRunAgentKind : null;

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary
            icon={<LuFolderPlus size={14} />}
            path={branch}
            suffix={agentKind !== null ? <ToolSummaryBadge label={agentKind} color="warning.main" /> : null}
          />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="workspace" />
    </ToolCardShell>
  );
}
