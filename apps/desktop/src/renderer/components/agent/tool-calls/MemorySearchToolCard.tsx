import { Box, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { ToolSummaryBadge } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText, parseMemorySearchMatches } from "./helpers";

/** Renders the specialized memory_search tool-call card. */
export function MemorySearchToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const memorySearchQuery = typeof toolCall.arguments.query === "string" ? toolCall.arguments.query : null;
  const memorySearchCount = typeof result?.details?.count === "number" ? result.details.count : null;
  const resultText = extractResultText(result);
  const memorySearchMatches = useMemo(() => parseMemorySearchMatches(resultText), [resultText]);

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
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="results">
        {memorySearchMatches.length > 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {memorySearchMatches.map((match) => (
              <Box
                key={`${match.path}:${match.score}`}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  pb: 1,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:last-child": { pb: 0, borderBottom: 0 },
                }}
              >
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    whiteSpace: "pre-wrap",
                    m: 0,
                    color: "text.primary",
                  }}
                >
                  {match.path}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  rank {match.score.toFixed(3)}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.75rem",
                    whiteSpace: "pre-wrap",
                    color: "text.secondary",
                  }}
                >
                  {match.snippet}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : undefined}
      </ToolOutputSection>
    </ToolCardShell>
  );
}
