import { useState } from "react";
import { LuBookOpen } from "react-icons/lu";
import { DefaultToolCard } from "./DefaultToolCard";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { extractResultText } from "./diff";
import type { AgentToolCallCardProps } from "./summary";

/** Renders the specialized memory_read tool-call card. */
export function MemoryReadToolCard(props: AgentToolCallCardProps) {
  const { result = null, renderer, isError } = props;
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);

  if (renderer.kind !== "memoryRead") {
    return <DefaultToolCard {...props} />;
  }
  const memoryReadPath = renderer.path;

  return (
    <ToolCardShell isError={isError}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary icon={<LuBookOpen size={14} />} path={memoryReadPath} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={isError} label="contents" />
    </ToolCardShell>
  );
}
