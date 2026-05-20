import { Box, Typography, useTheme } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { openLink } from "../commands/appCommands";
import { buildWorkspaceFileUrl } from "../commands/fileCommands";
import { tabStore } from "../store/tabStore";
import { enqueueWorkspaceErrorNotice } from "../store/workspaceLifecycleNoticeStore";
import { markdownService } from "./markdownService";
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

/**
 * Memoized inner renderer that parses markdown in a Web Worker (off main thread)
 * and renders the resulting HTML with post-processing for mermaid, images, and links.
 */
const MemoizedMarkdownRenderer = memo(function MemoizedMarkdownRenderer({
  content,
  filePath,
  worktreePath,
}: MarkdownPreviewProps) {
  const theme = useTheme();
  const styles = useMarkdownStyles(theme);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [mermaidBlocks, setMermaidBlocks] = useState<Array<{ id: string; code: string }>>([]);

  const fileDir = useMemo(() => {
    if (!filePath) return "";
    const parts = filePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  }, [filePath]);

  // Parse markdown in worker
  useEffect(() => {
    if (!content.trim()) {
      setHtml(null);
      setMermaidBlocks([]);
      return;
    }

    let cancelled = false;

    markdownService.parse(content).then((result) => {
      if (!cancelled) {
        setHtml(result);
      }
    }).catch((err) => {
      if (!cancelled) {
        console.error("[MarkdownPreview] Worker parse error", err);
        setHtml(`<p style="color: red;">Failed to render markdown</p>`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [content]);

  // Post-process rendered HTML: extract mermaid blocks, fix images, attach link handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container || html === null) return;

    // Set HTML content
    container.innerHTML = html;

    // Extract mermaid code blocks and replace with placeholder divs.
    // Support both shapes:
    // 1) <pre class="mermaid">...</pre>
    // 2) <pre><code class="language-mermaid">...</code></pre>
    const mermaidPres = new Set<HTMLElement>();
    container.querySelectorAll("pre.mermaid").forEach((pre) => {
      mermaidPres.add(pre as HTMLElement);
    });
    container.querySelectorAll("pre code.language-mermaid").forEach((codeEl) => {
      const pre = codeEl.closest("pre");
      if (pre) {
        mermaidPres.add(pre as HTMLElement);
      }
    });
    const blocks: Array<{ id: string; code: string }> = [];
    Array.from(mermaidPres).forEach((pre, index) => {
      const code = pre.textContent?.replace(/\n$/, "") ?? "";
      const id = `mermaid-placeholder-${index}`;
      const placeholder = document.createElement("div");
      placeholder.setAttribute("data-mermaid-id", id);
      pre.replaceWith(placeholder);
      blocks.push({ id, code });
    });
    setMermaidBlocks(blocks);

    // Fix images: resolve relative paths to workspace file URLs
    if (worktreePath) {
      const images = container.querySelectorAll("img");
      images.forEach((img) => {
        const src = img.getAttribute("src");
        if (!src || isAbsoluteUrl(src)) return;

        const cleanSrc = src.replace(/[?#].*$/, "");
        const relativePath = resolveRelativePath(fileDir, cleanSrc);
        const cacheKey = `${worktreePath}:${relativePath}`;

        const cached = workspaceImageUrlCache.get(cacheKey);
        if (cached) {
          img.src = cached;
          return;
        }

        try {
          const protocolUrl = buildWorkspaceFileUrl({ workspaceWorktreePath: worktreePath, relativePath });
          workspaceImageUrlCache.set(cacheKey, protocolUrl);
          img.src = protocolUrl;
        } catch {
          // Leave original src on failure
        }
      });
    }

    // Attach link click handlers
    const links = container.querySelectorAll("a[href]");
    links.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#")) return;

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
      });
    });
  }, [html, worktreePath, fileDir]);

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
      <Box ref={containerRef} />
      {/* Render mermaid blocks as React portals into their placeholder divs */}
      {mermaidBlocks.map((block) => (
        <MermaidPortal key={block.id} targetId={block.id} code={block.code} containerRef={containerRef} />
      ))}
    </Box>
  );
});

/** Renders a MermaidBlock into a placeholder div found within the container. */
function MermaidPortal({
  targetId,
  code,
  containerRef,
}: {
  targetId: string;
  code: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const target = container.querySelector(`[data-mermaid-id="${targetId}"]`);
    if (!target) return;

    // Render directly into the existing placeholder node.
    portalRef.current = target as HTMLDivElement;
    setMounted(true);

    return () => {
      if (portalRef.current) {
        portalRef.current.innerHTML = "";
      }
      portalRef.current = null;
      setMounted(false);
    };
  }, [targetId, containerRef]);

  if (!mounted || !portalRef.current) return null;

  return ReactDOM.createPortal(<MermaidBlock code={code} />, portalRef.current);
}

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
