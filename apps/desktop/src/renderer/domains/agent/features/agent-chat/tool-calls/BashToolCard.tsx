import { useState } from "react";
import { LuSquareTerminal } from "react-icons/lu";
import { DefaultToolCard } from "./DefaultToolCard";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { extractResultText } from "./diff";
import type { AgentToolCallCardProps } from "./summary";

/** Renders the specialized bash tool-call card. */
export function BashToolCard(props: AgentToolCallCardProps) {
  const { result = null, renderer, isError } = props;
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);

  if (renderer.kind !== "bash") {
    return <DefaultToolCard {...props} />;
  }
  const command = renderer.command;

  return (
    <ToolCardShell isError={isError}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary icon={<LuSquareTerminal size={14} />} path={command} wrap={open} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={isError} />
    </ToolCardShell>
  );
}
