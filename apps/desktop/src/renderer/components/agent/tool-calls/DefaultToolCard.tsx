import { Typography } from "@mui/material";
import { useState } from "react";
import { ToolCardShell, ToolDefaultHeader, ToolSummaryPanel } from "./ToolCardShell";
import { ToolOutputSection } from "./ToolOutputSection";
import { type AgentToolCallCardProps, extractResultText } from "./helpers";

/** Renders the fallback tool-call card for unsupported tool types. */
export function DefaultToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);
  const resultText = extractResultText(result);

  return (
    <ToolCardShell isError={result?.isError === true} outlined>
      <ToolDefaultHeader
        toolName={toolCall.name}
        isError={result?.isError === true}
        onToggle={() => setOpen(!open)}
        open={open}
      />
      <ToolSummaryPanel>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          arguments
        </Typography>
        <Typography
          variant="body2"
          component="pre"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            m: 0,
          }}
        >
          {argsStr}
        </Typography>
      </ToolSummaryPanel>
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} />
    </ToolCardShell>
  );
}
