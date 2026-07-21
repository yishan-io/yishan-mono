import { Box } from "@mui/material";
import { LuBookOpen } from "react-icons/lu";
import { SkillUsageMarker } from "../SkillUsageMarker";
import { ToolLineRange } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, buildReadSummary } from "./helpers";

function getSkillName(readPath: string): string | null {
  const pathSegments = readPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (pathSegments.at(-1) !== "SKILL.md") {
    return null;
  }

  return pathSegments.at(-2) ?? "SKILL";
}

/** Renders the specialized read tool-call card. */
export function ReadToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const readPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  if (!readPath) {
    return null;
  }

  const readSummary = buildReadSummary(readPath, toolCall.arguments.offset, toolCall.arguments.limit);
  const skillName = getSkillName(readPath);
  const pathSummary = (
    <ToolPathSummary
      icon={<LuBookOpen size={14} />}
      path={readSummary.pathLabel}
      suffix={readSummary.lineRange ? <ToolLineRange lineRange={readSummary.lineRange} /> : null}
      inlineSuffix
    />
  );

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        {skillName ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <SkillUsageMarker skillName={skillName} />
            {pathSummary}
          </Box>
        ) : (
          pathSummary
        )}
      </ToolSummaryPanel>
    </ToolCardShell>
  );
}
