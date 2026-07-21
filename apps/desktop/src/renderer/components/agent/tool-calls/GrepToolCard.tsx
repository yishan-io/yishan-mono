import { Box, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import {
  type AgentToolCallCardProps,
  extractResultText,
  getPathBaseName,
  openGrepFileMatch,
  parseGrepMatchLines,
} from "./helpers";

/** Renders the specialized grep tool-call card. */
export function GrepToolCard({ toolCall, result = null, workspacePath }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const grepPattern = typeof toolCall.arguments.pattern === "string" ? toolCall.arguments.pattern : null;
  const grepPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const resultText = extractResultText(result);
  const grepMatchLines = useMemo(() => parseGrepMatchLines(resultText, grepPath), [grepPath, resultText]);

  if (!grepPattern) {
    return null;
  }

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary
            icon={<LuSearch size={14} />}
            path={grepPattern}
            suffix={grepPath ? <ToolSummaryBadge label={getPathBaseName(grepPath)} color="info.main" /> : null}
          />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true}>
        {grepMatchLines.length > 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {grepMatchLines.map((matchLine) => {
              const rowLabel = `${getPathBaseName(matchLine.filePath)}:${matchLine.lineNumber}: ${matchLine.preview}`;
              return workspacePath ? (
                <Box
                  key={`${matchLine.filePath}:${matchLine.lineNumber}:${matchLine.preview}`}
                  component="button"
                  type="button"
                  onClick={() => {
                    openGrepFileMatch(matchLine.filePath, workspacePath);
                  }}
                  sx={{
                    border: 0,
                    p: 0,
                    m: 0,
                    bgcolor: "transparent",
                    textAlign: "left",
                    color: "info.main",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                  }}
                >
                  {rowLabel}
                </Box>
              ) : (
                <Typography
                  key={`${matchLine.filePath}:${matchLine.lineNumber}:${matchLine.preview}`}
                  variant="body2"
                  component="pre"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    whiteSpace: "pre-wrap",
                    m: 0,
                  }}
                >
                  {rowLabel}
                </Typography>
              );
            })}
          </Box>
        ) : undefined}
      </ToolOutputSection>
    </ToolCardShell>
  );
}
