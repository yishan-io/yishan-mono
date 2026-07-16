import { useState } from "react";
import { LuSearch } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";

/** Renders the specialized memory_search tool-call card. */
export function MemorySearchToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const memorySearchQuery = typeof toolCall.arguments.query === "string" ? toolCall.arguments.query : null;
  const memorySearchCount = typeof result?.details?.count === "number" ? result.details.count : null;
  const resultText = extractResultText(result);

  if (!memorySearchQuery) {
    return null;
  }

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary
            icon={<LuSearch size={14} />}
            path={memorySearchQuery}
            suffix={
              memorySearchCount !== null ? (
                <ToolSummaryBadge label={`${memorySearchCount} results`} color="info.main" />
              ) : null
            }
          />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} />
    </ToolCardShell>
  );
}
