import { Box, Collapse, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { TbWorldSearch } from "react-icons/tb";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";
import { AgentMarkdownContent } from "../transcript/AgentMarkdownContent";

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
          <ToolPathSummary icon={<TbWorldSearch size={14} />} path={`Web Fetch: ${summaryLabel}`} />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      <Collapse in={open}>
        {resultText ? (
          <Box sx={{ m: 1, p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                display: "block",
                mb: 0.5,
              }}
            >
              fetched content{result?.isError ? " (error)" : ""}
            </Typography>
            <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
              <AgentMarkdownContent content={resultText} workspacePath={workspacePath} />
            </Box>
          </Box>
        ) : null}
      </Collapse>
    </ToolCardShell>
  );
}
