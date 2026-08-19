import { useState } from "react";
import { LuDatabase } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText, getPathBaseName } from "./helpers";

const MEMORY_STORE_PREFIX = "Stored memory entry in ";

/** Renders the specialized memory_store tool-call card. */
export function MemoryStoreToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);
  const memoryStoreSection =
    typeof result?.details?.section === "string"
      ? result.details.section
      : typeof toolCall.arguments.section === "string"
        ? toolCall.arguments.section
        : null;
  const memoryStoreFilePath =
    typeof result?.details?.path === "string"
      ? result.details.path
      : resultText.startsWith(MEMORY_STORE_PREFIX)
        ? resultText.slice(MEMORY_STORE_PREFIX.length).trim()
        : null;
  const memoryStoreFileLabel = memoryStoreFilePath ? getPathBaseName(memoryStoreFilePath) : "MEMORY.md";

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary
            icon={<LuDatabase size={14} />}
            path={memoryStoreFileLabel}
            suffix={memoryStoreSection ? <ToolSummaryBadge label={memoryStoreSection} color="secondary.main" /> : null}
          />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} />
    </ToolCardShell>
  );
}
