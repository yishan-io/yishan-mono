import { Box, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { TbWorldSearch } from "react-icons/tb";
import { AgentMarkdownContent } from "../transcript/AgentMarkdownContent";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";

/** Renders the specialized web_fetch tool-call card. */
export function WebFetchToolCard({ toolCall, result = null, workspacePath }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const resultText = extractResultText(result);

  const summaryLabel = useMemo(() => {
    const pages = toolCall.arguments.pages;
    if (Array.isArray(pages) && pages.length > 0) {
      const pageCount = pages.length;
      return `${pageCount} page${pageCount !== 1 ? "s" : ""}`;
    }

    const url = typeof toolCall.arguments.url === "string" ? toolCall.arguments.url : null;
    return url;
  }, [toolCall.arguments.pages, toolCall.arguments.url]);

  if (!summaryLabel) {
    return null;
  }

  return (
    <ToolCardShell isError={result?.isError === true}>
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
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="fetched content">
        <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
          <AgentMarkdownContent content={resultText} workspacePath={workspacePath} />
        </Box>
      </ToolOutputSection>
    </ToolCardShell>
  );
}
