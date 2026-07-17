import { useCallback, useEffect, useRef, useState } from "react";
import type { MarkdownViewModeConfig } from "./types";
import type { MarkdownViewMode } from "./types";

/** Manages markdown-specific layout and preview find state for the file editor. */
export function useMarkdownViewMode({ isMarkdown, defaultMarkdownViewMode }: MarkdownViewModeConfig) {
  const [viewMode, setViewMode] = useState<MarkdownViewMode>(() => (isMarkdown ? defaultMarkdownViewMode : "edit"));
  const previousMarkdownDefaultModeRef = useRef(defaultMarkdownViewMode);
  const [previewFindOpen, setPreviewFindOpen] = useState(false);
  const [previewFindQuery, setPreviewFindQuery] = useState("");
  const [previewFindMatchCount, setPreviewFindMatchCount] = useState(0);
  const [previewFindActiveIndex, setPreviewFindActiveIndex] = useState(0);

  useEffect(() => {
    if (isMarkdown) {
      setViewMode((previousMode) => (previousMode === "edit" ? defaultMarkdownViewMode : previousMode));
      return;
    }

    setViewMode("edit");
  }, [defaultMarkdownViewMode, isMarkdown]);

  useEffect(() => {
    if (!isMarkdown) {
      previousMarkdownDefaultModeRef.current = defaultMarkdownViewMode;
      return;
    }

    const previousMode = previousMarkdownDefaultModeRef.current;
    previousMarkdownDefaultModeRef.current = defaultMarkdownViewMode;
    setViewMode((currentMode) => (currentMode === previousMode ? defaultMarkdownViewMode : currentMode));
  }, [defaultMarkdownViewMode, isMarkdown]);

  useEffect(() => {
    if (viewMode === "preview") {
      return;
    }

    setPreviewFindOpen(false);
    setPreviewFindQuery("");
    setPreviewFindActiveIndex(0);
  }, [viewMode]);

  const handleSetViewMode = useCallback((mode: MarkdownViewMode) => {
    setViewMode(mode);
  }, []);

  const handlePreviewFindMatchCountChange = useCallback((count: number) => {
    setPreviewFindMatchCount(count);
    setPreviewFindActiveIndex((index) => Math.min(index, Math.max(0, count - 1)));
  }, []);

  const handlePreviewFindQueryChange = useCallback((query: string) => {
    setPreviewFindQuery(query);
    setPreviewFindActiveIndex(0);
  }, []);

  const handlePreviewFindNext = useCallback(() => {
    setPreviewFindActiveIndex((index) => (previewFindMatchCount > 0 ? (index + 1) % previewFindMatchCount : 0));
  }, [previewFindMatchCount]);

  const handlePreviewFindPrev = useCallback(() => {
    setPreviewFindActiveIndex((index) =>
      previewFindMatchCount > 0 ? (index - 1 + previewFindMatchCount) % previewFindMatchCount : 0,
    );
  }, [previewFindMatchCount]);

  const handlePreviewFindClose = useCallback(() => {
    setPreviewFindOpen(false);
    setPreviewFindQuery("");
    setPreviewFindActiveIndex(0);
  }, []);

  return {
    viewMode,
    setViewMode: handleSetViewMode,
    previewFindOpen,
    setPreviewFindOpen,
    previewFindQuery,
    previewFindActiveIndex,
    handlePreviewFindMatchCountChange,
    handlePreviewFindQueryChange,
    handlePreviewFindNext,
    handlePreviewFindPrev,
    handlePreviewFindClose,
  };
}
