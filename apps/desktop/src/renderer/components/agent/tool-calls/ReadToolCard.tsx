import { LuBookOpen } from "react-icons/lu";
import { ToolLineRange } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, buildReadSummary } from "./helpers";

/** Renders the specialized read tool-call card. */
export function ReadToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const readPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  if (!readPath) {
    return null;
  }

  const readSummary = buildReadSummary(readPath, toolCall.arguments.offset, toolCall.arguments.limit);

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolPathSummary
          icon={<LuBookOpen size={14} />}
          path={readSummary.pathLabel}
          suffix={readSummary.lineRange ? <ToolLineRange lineRange={readSummary.lineRange} /> : null}
          inlineSuffix
        />
      </ToolSummaryPanel>
    </ToolCardShell>
  );
}
