import { useState } from "react";
import { LuBookOpen } from "react-icons/lu";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { extractResultText } from "./diff";
import type { AgentToolCallCardProps } from "./summary";

/** Renders the specialized memory_read tool-call card. */
export function MemoryReadToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const memoryReadPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const resultText = extractResultText(result);

  if (!memoryReadPath) {
    return null;
  }

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary icon={<LuBookOpen size={14} />} path={memoryReadPath} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="contents" />
    </ToolCardShell>
  );
}
