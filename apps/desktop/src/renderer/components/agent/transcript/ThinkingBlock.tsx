import { Box, Collapse, Typography } from "@mui/material";
import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { AgentThinkingSignature } from "../../../store/agentChatTypes";

type ThinkingBlockProps = {
  thinking: string;
  thinkingSignature?: string | AgentThinkingSignature;
  isStreaming: boolean;
};

/** Renders one assistant thinking block with summary-first disclosure. */
export function ThinkingBlock({ thinking, thinkingSignature, isStreaming }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);
  const summaryText = getThinkingSummaryText(thinkingSignature);
  const hasExpandableDetails = hasExpandableThinkingDetails(thinking, summaryText);
  const visibleText = summaryText ? formatThinkingSummaryText(summaryText) : null;

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        onClick={() => {
          if (hasExpandableDetails) {
            setOpen(!open);
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          cursor: hasExpandableDetails ? "pointer" : "default",
          py: 0.25,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {isStreaming ? "Thinking" : "Thought"}
        </Typography>
        {visibleText ? (
          <Typography
            variant="body2"
            noWrap
            sx={{
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "text.disabled",
              fontStyle: "italic",
            }}
          >
            {visibleText}
          </Typography>
        ) : null}
        {hasExpandableDetails ? (
          <Box
            component="span"
            aria-label="Toggle thought details"
            sx={{ display: "inline-flex", alignItems: "center", color: "text.secondary" }}
          >
            {open ? (
              <LuChevronDown data-testid="thinking-chevron-down" size={14} />
            ) : (
              <LuChevronRight data-testid="thinking-chevron-right" size={14} />
            )}
          </Box>
        ) : null}
      </Box>
      {hasExpandableDetails ? (
        <Collapse in={open}>
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", px: 1, py: 0.5, color: "text.disabled", fontStyle: "italic" }}
          >
            {thinking}
          </Typography>
        </Collapse>
      ) : null}
    </Box>
  );
}

function getThinkingSummaryText(thinkingSignature: string | AgentThinkingSignature | undefined): string | null {
  const parsedSignature = parseThinkingSignature(thinkingSignature);
  const summaryItems = parsedSignature?.summary;
  if (!summaryItems || summaryItems.length === 0) {
    return null;
  }

  const summaryText = summaryItems
    .map((summaryItem) => summaryItem.text.trim())
    .filter((text) => text.length > 0)
    .join(", ")
    .trim();
  return summaryText.length > 0 ? summaryText : null;
}

function parseThinkingSignature(
  thinkingSignature: string | AgentThinkingSignature | undefined,
): AgentThinkingSignature | null {
  if (!thinkingSignature) {
    return null;
  }

  if (typeof thinkingSignature === "string") {
    try {
      const parsedSignature = JSON.parse(thinkingSignature) as AgentThinkingSignature;
      return typeof parsedSignature === "object" && parsedSignature !== null ? parsedSignature : null;
    } catch {
      return null;
    }
  }

  return thinkingSignature;
}

function formatThinkingSummaryText(summaryText: string): string {
  return summaryText.replaceAll("**", "");
}

function hasExpandableThinkingDetails(thinking: string, summaryText: string | null): boolean {
  const normalizedThinking = normalizeThinkingComparisonText(thinking);
  if (!normalizedThinking) {
    return false;
  }

  if (!summaryText) {
    return true;
  }

  return normalizedThinking !== normalizeThinkingComparisonText(summaryText);
}

function normalizeThinkingComparisonText(value: string): string {
  return value
    .replace(/[,*_`#>\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
