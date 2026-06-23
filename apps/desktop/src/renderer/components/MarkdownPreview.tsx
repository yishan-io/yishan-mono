import { Box, Table, TableBody, TableCell, TableRow, Typography, useTheme } from "@mui/material";
import type React from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { openLink } from "../commands/appCommands";
import { buildWorkspaceFileUrl } from "../commands/fileCommands";
import { layoutStore } from "../store/settings/layoutStore";
import { tabStore } from "../store/tabStore";
import { enqueueWorkspaceErrorNotice } from "../store/workspaceLifecycleNoticeStore";
import { MermaidBlock } from "./MermaidBlock";
import { MarkdownFindBar } from "./MarkdownFindBar";
import { clearHighlights, highlightMatches, setActiveMatch } from "./markdownSearch";
import {
  getTaskListItemChecked,
  isAbsoluteUrl,
  parseFrontmatter,
  resolveRelativePath,
  toggleTaskListItem,
} from "./markdownHelpers";
import { markdownService } from "./markdownService";
import { useMarkdownStyles } from "./markdownStyles";

const MARKDOWN_RENDER_DEBOUNCE_MS = 400;
const MARKDOWN_PREVIEW_BASE_FONT_SIZE_BY_MODE = {
  small: 14,
  medium: 16,
  large: 18,
} as const;

type MarkdownPreviewProps = {
  content: string;
  filePath?: string;
  worktreePath?: string;
  canEdit?: boolean;
  onContentChange?: (content: string) => void;
  immediateUpdateToken?: number;
  findOpen?: boolean;
  findQuery?: string;
  findActiveIndex?: number;
  onFindMatchCountChange?: (count: number) => void;
  onFindQueryChange?: (query: string) => void;
  onFindNext?: () => void;
  onFindPrev?: () => void;
  onFindClose?: () => void;
};

const workspaceImageUrlCache = new Map<string, string>();

async function openMarkdownLink(url: string): Promise<void> {
  const result = await openLink({ url });

  if (result.opened) {
    return;
  }

  enqueueWorkspaceErrorNotice({
    title: "Failed to open link",
    message: `Could not open link in external app (${result.reason}).`,
  });
}

/**
 * Memoized inner renderer that parses markdown in a Web Worker (off main thread)
 * and renders the resulting HTML with post-processing for mermaid, images, and links.
 */
const MemoizedMarkdownRenderer = memo(function MemoizedMarkdownRenderer({
  content,
  filePath,
  worktreePath,
  canEdit = false,
  onContentChange,
  findOpen = false,
  findQuery = "",
  findActiveIndex = 0,
  onFindMatchCountChange,
  onFindQueryChange,
  onFindNext,
  onFindPrev,
  onFindClose,
}: MarkdownPreviewProps) {
  const theme = useTheme();
  const markdownPreviewFontSize = layoutStore((state) => state.markdownPreviewFontSize);
  const markdownPreviewWidth = layoutStore((state) => state.markdownPreviewWidth);
  const baseFontSize = MARKDOWN_PREVIEW_BASE_FONT_SIZE_BY_MODE[markdownPreviewFontSize];
  const styles = useMarkdownStyles(theme, baseFontSize);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [mermaidBlocks, setMermaidBlocks] = useState<Array<{ id: string; code: string }>>([]);
  const [localMatchCount, setLocalMatchCount] = useState(0);

  const { metadata, body } = useMemo(() => parseFrontmatter(content), [content]);

  const fileDir = useMemo(() => {
    if (!filePath) return "";
    const parts = filePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  }, [filePath]);

  // Parse markdown in worker
  useEffect(() => {
    if (!body.trim()) {
      setHtml(null);
      setMermaidBlocks([]);
      return;
    }

    let cancelled = false;

    markdownService
      .parse(body)
      .then((result) => {
        if (!cancelled) {
          setHtml(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[MarkdownPreview] Worker parse error", err);
          setHtml(`<p style="color: red;">Failed to render markdown</p>`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [body]);

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
    for (const pre of Array.from(container.querySelectorAll("pre.mermaid"))) {
      mermaidPres.add(pre as HTMLElement);
    }
    for (const codeEl of Array.from(container.querySelectorAll("pre code.language-mermaid"))) {
      const pre = codeEl.closest("pre");
      if (pre) {
        mermaidPres.add(pre as HTMLElement);
      }
    }
    const blocks: Array<{ id: string; code: string }> = [];
    let mermaidIndex = 0;
    for (const pre of mermaidPres) {
      const code = pre.textContent?.replace(/\n$/, "") ?? "";
      const id = `mermaid-placeholder-${mermaidIndex}`;
      const placeholder = document.createElement("div");
      placeholder.setAttribute("data-mermaid-id", id);
      pre.replaceWith(placeholder);
      blocks.push({ id, code });
      mermaidIndex += 1;
    }
    setMermaidBlocks(blocks);

    // Fix images: resolve relative paths to workspace file URLs
    if (worktreePath) {
      const images = Array.from(container.querySelectorAll("img"));
      for (const img of images) {
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
      }
    }

    // Attach link click handlers
    const links = Array.from(container.querySelectorAll("a[href]"));
    for (const link of links) {
      link.addEventListener("click", (event: Event) => {
        event.preventDefault();
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
    }

    // Attach task-list checkbox handlers
    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>("input[type='checkbox']"));
    for (const [index, checkbox] of checkboxes.entries()) {
      checkbox.disabled = !canEdit;
      if (!canEdit) {
        continue;
      }

      checkbox.addEventListener("click", (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentChecked = getTaskListItemChecked(content, index);
        if (currentChecked === null) {
          return;
        }
        const nextChecked = !currentChecked;
        const nextContent = toggleTaskListItem(content, index, nextChecked);
        if (nextContent !== content) {
          onContentChange?.(nextContent);
        }
      });
    }
  }, [html, worktreePath, fileDir, canEdit, content, onContentChange]);

  // Apply find highlights whenever the rendered HTML, query, or active index changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!findOpen || !findQuery) {
      clearHighlights(container);
      setLocalMatchCount(0);
      onFindMatchCountChange?.(0);
      return;
    }
    const count = highlightMatches(container, findQuery);
    setLocalMatchCount(count);
    onFindMatchCountChange?.(count);
    setActiveMatch(container, findActiveIndex);
  }, [html, findOpen, findQuery, findActiveIndex, onFindMatchCountChange]);

  if (!body.trim() && !metadata) {
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
    <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
      {findOpen && (
        <MarkdownFindBar
          query={findQuery}
          activeIndex={findActiveIndex}
          matchCount={localMatchCount}
          onQueryChange={onFindQueryChange}
          onNext={onFindNext}
          onPrev={onFindPrev}
          onClose={onFindClose}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "auto",
          px: markdownPreviewWidth === "full" ? 3 : 4,
          py: 3,
        }}
      >
        {metadata && (
          <Box
            sx={{
              width: "100%",
              maxWidth: markdownPreviewWidth === "full" ? "none" : 860,
              mx: markdownPreviewWidth === "full" ? 0 : "auto",
              mb: 3,
              overflow: "auto",
            }}
          >
            <Table
              size="small"
              sx={{
                fontSize: "0.875em",
                border: 1,
                borderColor: "divider",
                "& td, & th": { border: 1, borderColor: "divider" },
              }}
            >
              <TableBody>
                {Object.entries(metadata).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        width: "1%",
                        borderRight: 1,
                        borderColor: "divider",
                      }}
                    >
                      {key}
                    </TableCell>
                    <TableCell>{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        <Box
          ref={containerRef}
          sx={{
            width: "100%",
            maxWidth: markdownPreviewWidth === "full" ? "none" : 860,
            mx: markdownPreviewWidth === "full" ? 0 : "auto",
            ...styles.container,
          }}
        />
        {/* Render mermaid blocks as React portals into their placeholder divs */}
        {mermaidBlocks.map((block) => (
          <MermaidPortal key={block.id} targetId={block.id} code={block.code} containerRef={containerRef} />
        ))}
      </Box>
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
export function MarkdownPreview({
  content,
  filePath,
  worktreePath,
  canEdit = false,
  onContentChange,
  immediateUpdateToken = 0,
  findOpen,
  findQuery,
  findActiveIndex,
  onFindMatchCountChange,
  onFindQueryChange,
  onFindNext,
  onFindPrev,
  onFindClose,
}: MarkdownPreviewProps) {
  const [debouncedContent, setDebouncedContent] = useState(content);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousImmediateUpdateTokenRef = useRef(immediateUpdateToken);

  useEffect(() => {
    if (immediateUpdateToken !== previousImmediateUpdateTokenRef.current) {
      previousImmediateUpdateTokenRef.current = immediateUpdateToken;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDebouncedContent(content);
      return;
    }

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
  }, [content, debouncedContent, immediateUpdateToken]);

  return (
    <MemoizedMarkdownRenderer
      content={debouncedContent}
      filePath={filePath}
      worktreePath={worktreePath}
      canEdit={canEdit}
      onContentChange={onContentChange}
      findOpen={findOpen}
      findQuery={findQuery}
      findActiveIndex={findActiveIndex}
      onFindMatchCountChange={onFindMatchCountChange}
      onFindQueryChange={onFindQueryChange}
      onFindNext={onFindNext}
      onFindPrev={onFindPrev}
      onFindClose={onFindClose}
    />
  );
}
