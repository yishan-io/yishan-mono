import { Box, Typography } from "@mui/material";
import { useState } from "react";
import { TbWorldSearch } from "react-icons/tb";
import { AgentMarkdownContent } from "../transcript/AgentMarkdownContent";
import { DefaultToolCard } from "./DefaultToolCard";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { extractResultText } from "./diff";
import type { AgentToolCallCardProps } from "./summary";

/** Renders the specialized web_fetch tool-call card. */
export function WebFetchToolCard(props: AgentToolCallCardProps) {
  const { toolCall, result = null, workspacePath, renderer, isError } = props;
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);

  if (renderer.kind !== "webFetch") {
    return <DefaultToolCard {...props} />;
  }
  const isBatch = Array.isArray(toolCall.arguments.pages) && toolCall.arguments.pages.length > 0;
  const pageCount = renderer.urls.length;
  const summaryLabel = isBatch ? `${pageCount} page${pageCount !== 1 ? "s" : ""}` : renderer.urls[0];

  return (
    <ToolCardShell isError={isError}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, minWidth: 0, flex: 1 }}>
            <Box
              component="span"
              aria-hidden
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                opacity: 0.8,
                mt: "1px",
              }}
            >
              <TbWorldSearch size={18} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
              Web Fetch:
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
                minWidth: 0,
                flex: 1,
                color: "text.primary",
              }}
            >
              {summaryLabel}
            </Typography>
          </Box>
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={isError} label="fetched content">
        <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
          <AgentMarkdownContent content={resultText} workspacePath={workspacePath} />
        </Box>
      </ToolOutputSection>
    </ToolCardShell>
  );
}
