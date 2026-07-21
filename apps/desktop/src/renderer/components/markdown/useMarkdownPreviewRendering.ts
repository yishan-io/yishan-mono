import { useEffect, useMemo, useState } from "react";
import type { MarkdownPreviewProps } from "./MarkdownPreview";
import { parseFrontmatter } from "./markdownHelpers";
import type { MarkdownOutlineData } from "./markdownOutlineTree";
import { postProcessMarkdownPreview } from "./markdownPreviewDom";
import { clearHighlights, highlightMatches, setActiveMatch } from "./markdownSearch";
import { markdownService } from "./markdownService";
import { useMarkdownPreviewOutlineState } from "./useMarkdownPreviewOutlineState";

/** Manages markdown parsing, DOM post-processing, outline data, and find highlights. */
export function useMarkdownPreviewRendering({
  content,
  filePath,
  worktreePath,
  canEdit = false,
  onContentChange,
  findOpen = false,
  findQuery = "",
  findActiveIndex = 0,
  onFindMatchCountChange,
  container,
}: Pick<
  MarkdownPreviewProps,
  | "content"
  | "filePath"
  | "worktreePath"
  | "canEdit"
  | "onContentChange"
  | "findOpen"
  | "findQuery"
  | "findActiveIndex"
  | "onFindMatchCountChange"
> & {
  container: HTMLDivElement | null;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [mermaidBlocks, setMermaidBlocks] = useState<Array<{ id: string; code: string }>>([]);
  const [localMatchCount, setLocalMatchCount] = useState(0);
  const [outlineData, setOutlineData] = useState<MarkdownOutlineData>({ items: [], entries: [] });
  const { metadata, body } = useMemo(() => parseFrontmatter(content), [content]);
  const { collapsedOutlineIds, activeOutlineId, handleToggleOutlineCollapse, handleSelectOutlineItem } =
    useMarkdownPreviewOutlineState(outlineData);
  const fileDir = useMemo(() => {
    if (!filePath) {
      return "";
    }

    const parts = filePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  }, [filePath]);

  useEffect(() => {
    if (!body.trim()) {
      setHtml(null);
      setMermaidBlocks([]);
      setOutlineData({ items: [], entries: [] });
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
      .catch((error) => {
        if (!cancelled) {
          console.error("[MarkdownPreview] Worker parse error", error);
          setHtml('<p style="color: red;">Failed to render markdown</p>');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [body]);

  useEffect(() => {
    if (!container || html === null) {
      return;
    }

    const { mermaidBlocks: nextMermaidBlocks, outlineData: nextOutlineData } = postProcessMarkdownPreview({
      container,
      html,
      worktreePath,
      fileDir,
      canEdit,
      content,
      onContentChange,
    });
    setMermaidBlocks(nextMermaidBlocks);
    if (nextOutlineData) {
      setOutlineData(nextOutlineData);
    }
  }, [container, html, worktreePath, fileDir, canEdit, content, onContentChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: html drives innerHTML mutation via container
  useEffect(() => {
    if (!container) {
      return;
    }
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
  }, [container, html, findOpen, findQuery, findActiveIndex, onFindMatchCountChange]);

  return {
    metadata,
    body,
    mermaidBlocks,
    localMatchCount,
    outlineData,
    collapsedOutlineIds,
    activeOutlineId,
    handleToggleOutlineCollapse,
    handleSelectOutlineItem,
  };
}
