import { Box, Typography, useTheme } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeMermaidLite from "rehype-mermaid-lite";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { openLink } from "../commands/appCommands";
import { buildWorkspaceFileUrl } from "../commands/fileCommands";
import { tabStore } from "../store/tabStore";
import { enqueueWorkspaceErrorNotice } from "../store/workspaceLifecycleNoticeStore";
import { MermaidBlock } from "./MermaidBlock";

const MARKDOWN_RENDER_DEBOUNCE_MS = 400;

type MarkdownPreviewProps = {
  content: string;
  filePath?: string;
  worktreePath?: string;
};

const workspaceImageUrlCache = new Map<string, string>();

function isAbsoluteUrl(src: string): boolean {
  return /^data:/i.test(src) || /^[a-z][a-z0-9+.-]*:/i.test(src);
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir ? baseDir.split("/") : [];
  const segments = relativePath.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      if (parts.length > 0) parts.pop();
    } else if (segment !== "." && segment !== "") {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "div",
    "span",
    "details",
    "summary",
    "abbr",
    "kbd",
    "mark",
    "sub",
    "sup",
    "br",
    "wbr",
    "figure",
    "figcaption",
    "picture",
    "source",
    "dl",
    "dt",
    "dd",
    "cite",
    "dfn",
    "var",
    "samp",
    "ruby",
    "rt",
    "rp",
    "bdi",
    "bdo",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      "style",
      "title",
      "role",
      "aria-*",
      "data-*",
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "width",
      "height",
    ],
    td: [
      ...(defaultSchema.attributes?.td ?? []),
      "colspan",
      "rowspan",
    ],
    th: [
      ...(defaultSchema.attributes?.th ?? []),
      "colspan",
      "rowspan",
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      "checked",
      "disabled",
    ],
  },
};

async function openMarkdownLink(url: string): Promise<void> {
  const result = await openLink({ url });

  if (result.opened) {
    return;
  }

  enqueueWorkspaceErrorNotice({
    title: "Failed to open link",
    message: "Could not open link in external app (" + result.reason + ").",
  });
}

/** Recursively extracts plain text from React node trees (strings, elements with children, arrays). */
function extractTextContent(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }
  return "";
}

/** highlight.js token colors inspired by GitHub's light/dark themes, applied via sx. */
function getCodeHighlightStyles(mode: "light" | "dark") {
  if (mode === "dark") {
    return {
      "& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-section, & .hljs-link":
        { color: "#ff7b72" },
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
    "& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-section, & .hljs-link":
      { color: "#cf222e" },
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
function useMarkdownStyles(theme: Theme) {
  return useMemo(
    () => ({
      container: {
        fontFamily: theme.typography.fontFamily,
        fontSize: 15,
        lineHeight: 1.7,
        color: theme.palette.text.primary,
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
          bgcolor:
            theme.palette.mode === "dark"
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(0, 0, 0, 0.06)",
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
          bgcolor:
            theme.palette.mode === "dark"
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(0, 0, 0, 0.04)",
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
    [theme],
  );
}

function MarkdownImage({
  src,
  alt,
  worktreePath,
  fileDir,
}: {
  src?: string;
  alt?: string;
  worktreePath: string;
  fileDir: string;
}) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const resolveImage = useCallback(async () => {
    if (!src) return;

    if (isAbsoluteUrl(src)) {
      setResolvedSrc(src);
      return;
    }

    if (!worktreePath) {
      setResolvedSrc(src);
      return;
    }

    const cleanSrc = src.replace(/[?#].*$/, "");
    const relativePath = resolveRelativePath(fileDir, cleanSrc);
    const cacheKey = `${worktreePath}:${relativePath}`;

    const cached = workspaceImageUrlCache.get(cacheKey);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }

    try {
      const protocolUrl = buildWorkspaceFileUrl({ workspaceWorktreePath: worktreePath, relativePath });
      workspaceImageUrlCache.set(cacheKey, protocolUrl);
      setResolvedSrc(protocolUrl);
    } catch {
      setError(true);
    }
  }, [src, worktreePath, fileDir]);

  useEffect(() => {
    setError(false);
    setResolvedSrc(null);
    void resolveImage();
  }, [resolveImage]);

  if (error) {
    return (
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: "action.hover",
          color: "text.secondary",
          fontSize: "0.85em",
        }}
      >
        {alt || "image"}
      </Box>
    );
  }

  if (!resolvedSrc) {
    return (
      <Box
        component="span"
        sx={{
          display: "inline-block",
          width: 48,
          height: 48,
          borderRadius: 1,
          bgcolor: "action.hover",
        }}
      />
    );
  }

  return <img src={resolvedSrc} alt={alt ?? ""} style={{ maxWidth: "100%", height: "auto", borderRadius: 4 }} />;
}

/**
 * Memoized inner renderer that only re-renders when `debouncedContent` actually changes.
 * This prevents the expensive rehype pipeline from running on every parent re-render.
 */
const MemoizedMarkdownRenderer = memo(function MemoizedMarkdownRenderer({
  content,
  filePath,
  worktreePath,
}: MarkdownPreviewProps) {
  const theme = useTheme();
  const styles = useMarkdownStyles(theme);

  const fileDir = useMemo(() => {
    if (!filePath) return "";
    const parts = filePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  }, [filePath]);

  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const rehypePlugins = useMemo(
    () => [
      rehypeRaw,
      [rehypeSanitize, sanitizeSchema],
      rehypeMermaidLite,
      rehypeHighlight,
    ],
    [],
  );

  const components = useMemo(
    () => ({
      pre: ({ className, children, ...props }: React.ComponentProps<"pre">) => {
        if (typeof className === "string" && className.split(/\s+/).includes("mermaid")) {
          const code = extractTextContent(children).replace(/\n$/, "");
          return <MermaidBlock code={code} />;
        }

        return <pre className={className} {...props}>{children}</pre>;
      },
      img: ({ src, alt, ...props }: React.ComponentProps<"img">) => (
        <MarkdownImage
          src={src}
          alt={alt}
          worktreePath={worktreePath ?? ""}
          fileDir={fileDir}
        />
      ),
      a: ({ href, children, ...props }: React.ComponentProps<"a">) => {
        const handleClick = (e: React.MouseEvent) => {
          if (!href) return;
          e.preventDefault();

          if (href.startsWith("#")) return;

          if (isAbsoluteUrl(href)) {
            void openMarkdownLink(href);
            return;
          }

          if (worktreePath) {
            const cleanPath = href.replace(/[?#].*$/, "");
            const resolvedPath = resolveRelativePath(fileDir, cleanPath);
            if (resolvedPath) {
              tabStore.getState().openTab({
                kind: "file",
                path: resolvedPath,
              });
            }
          }
        };

        return (
          <a href={href} onClick={handleClick} {...props}>
            {children}
          </a>
        );
      },
    }),
    [worktreePath, fileDir],
  );

  if (!content.trim()) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No content to preview
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        px: 4,
        py: 3,
        ...styles.container,
      }}
    >
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins as never}
        components={components}
      >
        {content}
      </Markdown>
    </Box>
  );
});

/** Renders a Markdown string as styled HTML using react-markdown with GFM and syntax highlighting support.
 *  Debounces content updates to avoid re-running the expensive rehype pipeline on every keystroke or file-change event. */
export function MarkdownPreview({ content, filePath, worktreePath }: MarkdownPreviewProps) {
  const [debouncedContent, setDebouncedContent] = useState(content);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If content is cleared or this is the first render, update immediately.
    if (!debouncedContent && content) {
      setDebouncedContent(content);
      return;
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebouncedContent(content);
    }, MARKDOWN_RENDER_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content]);

  return (
    <MemoizedMarkdownRenderer
      content={debouncedContent}
      filePath={filePath}
      worktreePath={worktreePath}
    />
  );
}
