import type { Theme } from "@mui/material/styles";
import { type CodeThemePalette, MONO_FONT_FAMILY } from "@renderer/ui/codeThemes";
import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { useMemo } from "react";

/** highlight.js token colors mapped from the resolved code theme palette, with diff markers locked to semantic tokens. */
export function getCodeHighlightStyles(palette: CodeThemePalette, mode: "light" | "dark") {
  const gitDiff = SEMANTIC_COLOR_TOKENS[mode].gitDiff;

  return {
    "& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-section, & .hljs-link": {
      color: palette.keyword,
    },
    "& .hljs-string, & .hljs-attr": { color: palette.string },
    "& .hljs-title, & .hljs-name, & .hljs-type": { color: palette.type },
    "& .hljs-number, & .hljs-symbol, & .hljs-bullet": { color: palette.number },
    "& .hljs-comment, & .hljs-quote, & .hljs-meta": { color: palette.comment },
    "& .hljs-deletion": {
      color: gitDiff.deleted,
      bgcolor: gitDiff.inline.deleted.background,
    },
    "& .hljs-addition": {
      color: gitDiff.added,
      bgcolor: gitDiff.inline.added.background,
    },
    "& .hljs-built_in, & .hljs-variable, & .hljs-template-variable": {
      color: palette.variable,
    },
    "& .hljs-params": { color: palette.variable },
    "& .hljs-regexp": { color: palette.string },
    "& .hljs-subst": { color: palette.foreground },
  };
}

/** Returns MUI-aware styles for the Markdown preview container, including code theme palette integration. */
export function useMarkdownStyles(
  theme: Theme,
  baseFontSize: number,
  codePalette: CodeThemePalette,
  codeFontSize: number,
  codeMode: "light" | "dark",
) {
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
        "& li > ul > li:has(> input[type='checkbox']), & li > ol > li:has(> input[type='checkbox'])": {
          ml: 0,
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
          fontFamily: MONO_FONT_FAMILY,
          fontSize: "0.875em",
          px: 0.75,
          py: 0.25,
          borderRadius: 0.75,
          bgcolor: codeMode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
        },

        // Code blocks
        "& pre": {
          fontFamily: MONO_FONT_FAMILY,
          fontSize: codeFontSize,
          lineHeight: 1.6,
          mt: 0,
          mb: 1.5,
          p: 2,
          borderRadius: 1,
          overflow: "auto",
          bgcolor: codePalette.background,
          border: `1px solid ${codePalette.lineHighlight}`,
          "& code": {
            fontFamily: "inherit",
            fontSize: "inherit",
            p: 0,
            borderRadius: 0,
            bgcolor: "transparent",
          },
          // Syntax highlighting token colors
          ...getCodeHighlightStyles(codePalette, codeMode),
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
    [baseFontSize, codeFontSize, codePalette, theme, codeMode],
  );
}
