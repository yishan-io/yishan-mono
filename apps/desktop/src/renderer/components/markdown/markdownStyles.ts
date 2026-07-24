import type { Theme } from "@mui/material/styles";
import { useMemo } from "react";

/** highlight.js token colors inspired by GitHub's light/dark themes, applied via sx. */
export function getCodeHighlightStyles(mode: "light" | "dark") {
  if (mode === "dark") {
    return {
      "& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-section, & .hljs-link": { color: "#ff7b72" },
      "& .hljs-string, & .hljs-attr": { color: "#a5d6ff" },
      "& .hljs-title, & .hljs-name, & .hljs-type": { color: "#d2a8ff" },
      "& .hljs-number, & .hljs-symbol, & .hljs-bullet": { color: "#79c0ff" },
      "& .hljs-comment, & .hljs-quote, & .hljs-meta": { color: "#8b949e" },
      "& .hljs-deletion": { color: "#ffa198", bgcolor: "rgba(255, 129, 130, 0.1)" },
      "& .hljs-addition": { color: "#7ee787", bgcolor: "rgba(63, 185, 80, 0.1)" },
      "& .hljs-built_in": { color: "#ffa657" },
      "& .hljs-variable, & .hljs-template-variable": { color: "#ffa657" },
      "& .hljs-params": { color: "#c9d1d9" },
      "& .hljs-regexp": { color: "#7ee787" },
      "& .hljs-subst": { color: "#c9d1d9" },
    };
  }

  return {
    "& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-section, & .hljs-link": { color: "#cf222e" },
    "& .hljs-string, & .hljs-attr": { color: "#0a3069" },
    "& .hljs-title, & .hljs-name, & .hljs-type": { color: "#8250df" },
    "& .hljs-number, & .hljs-symbol, & .hljs-bullet": { color: "#0550ae" },
    "& .hljs-comment, & .hljs-quote, & .hljs-meta": { color: "#6e7781" },
    "& .hljs-deletion": { color: "#82071e", bgcolor: "rgba(255, 129, 130, 0.1)" },
    "& .hljs-addition": { color: "#116329", bgcolor: "rgba(63, 185, 80, 0.1)" },
    "& .hljs-built_in": { color: "#953800" },
    "& .hljs-variable, & .hljs-template-variable": { color: "#953800" },
    "& .hljs-params": { color: "#24292f" },
    "& .hljs-regexp": { color: "#116329" },
    "& .hljs-subst": { color: "#24292f" },
  };
}

/** Returns MUI-aware styles for the Markdown preview container. */
export function useMarkdownStyles(theme: Theme, baseFontSize = 15) {
  return useMemo(
    () => ({
      container: {
        fontFamily: theme.typography.fontFamily,
        fontSize: baseFontSize,
        lineHeight: 1.7,
        color: theme.palette.text.primary,
        overflowWrap: "break-word" as const,
        "& > *:first-of-type": { mt: 0 },
        "& > *:last-child": { mb: 0 },

        // Headings
        "& h1": {
          fontSize: "1.75em",
          fontWeight: 600,
          mt: 4,
          mb: 2,
          pb: 0.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          lineHeight: 1.3,
        },
        "& h2": {
          fontSize: "1.4em",
          fontWeight: 600,
          mt: 4,
          mb: 1.5,
          pb: 0.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          lineHeight: 1.3,
        },
        "& h3": {
          fontSize: "1.2em",
          fontWeight: 600,
          mt: 3.5,
          mb: 1.5,
          lineHeight: 1.4,
        },
        "& h4": {
          fontSize: "1.05em",
          fontWeight: 600,
          mt: 3,
          mb: 1,
          lineHeight: 1.4,
        },
        "& h5, & h6": {
          fontSize: "0.95em",
          fontWeight: 600,
          mt: 3,
          mb: 1,
          lineHeight: 1.4,
        },
        "& h6": {
          color: theme.palette.text.secondary,
        },

        // Paragraphs
        "& p": {
          mt: 0,
          mb: 1.5,
        },

        // Links
        "& a": {
          color: theme.palette.primary.main,
          textDecoration: "none",
          "&:hover": {
            textDecoration: "underline",
          },
        },

        // Bold / Emphasis
        "& strong": {
          fontWeight: 600,
        },

        // Lists
        "& ul, & ol": {
          mt: 0,
          mb: 1.5,
          pl: 3,
        },
        "& li": {
          mb: 0.25,
        },
        "& li > p": {
          mb: 0.5,
        },
        // Task list items (GFM)
        "& li:has(> input[type='checkbox'])": {
          listStyle: "none",
          ml: -2.5,
        },
        "& input[type='checkbox']": {
          mr: 0.75,
          verticalAlign: "middle",
        },

        // Blockquotes
        "& blockquote": {
          m: 0,
          mb: 1.5,
          pl: 2,
          borderLeft: `4px solid ${theme.palette.divider}`,
          color: theme.palette.text.secondary,
          "& p:last-child": {
            mb: 0,
          },
        },

        // Inline code
        "& :not(pre) > code": {
          fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
          fontSize: "0.875em",
          px: 0.75,
          py: 0.25,
          borderRadius: 0.75,
          bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
        },

        // Code blocks
        "& pre": {
          fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
          fontSize: "0.8125em",
          lineHeight: 1.6,
          mt: 0,
          mb: 1.5,
          p: 2,
          borderRadius: 1,
          overflow: "auto",
          bgcolor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
          border: `1px solid ${theme.palette.divider}`,
          "& code": {
            fontFamily: "inherit",
            fontSize: "inherit",
            p: 0,
            borderRadius: 0,
            bgcolor: "transparent",
          },
          // Syntax highlighting token colors
          ...getCodeHighlightStyles(theme.palette.mode),
        },

        // Horizontal rules
        "& hr": {
          border: "none",
          height: "1px",
          bgcolor: theme.palette.divider,
          my: 3,
        },

        // Tables (GFM)
        "& table": {
          width: "100%",
          borderCollapse: "collapse",
          mb: 1.5,
          fontSize: "0.875em",
        },
        "& th": {
          fontWeight: 600,
          textAlign: "left",
          px: 1.5,
          py: 0.75,
          borderBottom: `2px solid ${theme.palette.divider}`,
        },
        "& td": {
          px: 1.5,
          py: 0.75,
          borderBottom: `1px solid ${theme.palette.divider}`,
        },
        "& tr:last-child td": {
          borderBottom: "none",
        },

        // Images
        "& img": {
          maxWidth: "100%",
          height: "auto",
          borderRadius: 1,
        },

        // Strikethrough (GFM)
        "& del": {
          color: theme.palette.text.secondary,
        },

        // Footnotes (GFM)
        "& .footnotes": {
          mt: 4,
          pt: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
          fontSize: "0.875em",
          color: theme.palette.text.secondary,
        },
      },
    }),
    [baseFontSize, theme],
  );
}
