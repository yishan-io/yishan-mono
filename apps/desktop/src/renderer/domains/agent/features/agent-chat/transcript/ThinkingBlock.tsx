import { Box, Collapse, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { ThinkingDisplay } from "../../../chat/transcript/presentation.types";

type ThinkingBlockProps = { model: ThinkingDisplay };

/** Renders one assistant thinking block with summary-first disclosure. */
export function ThinkingBlock({ model }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);
  const { text: thinking, summary: visibleText, hasDetails: hasExpandableDetails, isStreaming } = model;

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
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            flexShrink: 0,
          }}
        >
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
          <IconButton
            aria-expanded={open}
            aria-label="Toggle thought details"
            sx={{ width: 20, height: 20, flexShrink: 0, color: "text.secondary" }}
          >
            {open ? (
              <LuChevronDown data-testid="thinking-chevron-down" size={14} />
            ) : (
              <LuChevronRight data-testid="thinking-chevron-right" size={14} />
            )}
          </IconButton>
        ) : null}
      </Box>
      {hasExpandableDetails ? (
        <Collapse in={open}>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              px: 1,
              py: 0.5,
              color: "text.disabled",
              fontStyle: "italic",
            }}
          >
            {thinking}
          </Typography>
        </Collapse>
      ) : null}
    </Box>
  );
}
