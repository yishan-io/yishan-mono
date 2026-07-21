import { Box, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGitGutterDecorations } from "../hooks/useGitGutterDecorations";
import type { MarkdownDefaultViewMode } from "../store/settings/layoutStore";
import { FileViewerToolbar } from "./FileViewerToolbar";
import { MarkdownPreviewPane } from "./fileEditor/MarkdownPreviewPane";
import { MarkdownViewModeActions } from "./fileEditor/MarkdownViewModeActions";
import { useMarkdownViewMode } from "./fileEditor/useMarkdownViewMode";
import { useMonacoFileEditor } from "./fileEditor/useMonacoFileEditor";

type FileEditorProps = {
  workspaceId?: string;
  path: string;
  content: string;
  worktreePath?: string;
  isDeleted?: boolean;
  /** When true, diff gutter decorations are suppressed (file is git-ignored). */
  isIgnored?: boolean;
  defaultMarkdownViewMode?: MarkdownDefaultViewMode;
  focusRequestKey?: number;
  onContentChange?: (content: string) => void;
  onSave?: (content: string) => void | Promise<void>;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

/** Renders a Monaco file editor with markdown preview modes and save shortcuts. */
export function FileEditor({
  workspaceId,
  path,
  content,
  worktreePath,
  isDeleted = false,
  isIgnored = false,
  defaultMarkdownViewMode = "split",
  focusRequestKey = 0,
  onContentChange,
  onSave,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: FileEditorProps) {
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [editorPaneRatio, setEditorPaneRatio] = useState(0.5);
  const {
    editorHostRef,
    editorRef,
    editorInstance,
    currentContent,
    markdownPreviewImmediateUpdateToken,
    isMarkdown,
    handleMarkdownPreviewContentChange,
  } = useMonacoFileEditor({
    path,
    content,
    isDeleted,
    focusRequestKey,
    onContentChange,
    onSave,
  });
  const {
    viewMode,
    setViewMode,
    previewFindOpen,
    setPreviewFindOpen,
    previewFindQuery,
    previewFindActiveIndex,
    handlePreviewFindMatchCountChange,
    handlePreviewFindQueryChange,
    handlePreviewFindNext,
    handlePreviewFindPrev,
    handlePreviewFindClose,
  } = useMarkdownViewMode({
    isMarkdown,
    defaultMarkdownViewMode,
  });

  const showEditor = viewMode === "edit" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  useEffect(() => {
    void editorPaneRatio;

    if (!showEditor) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.layout();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [editorPaneRatio, editorRef, showEditor]);

  const handlePreviewKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isCmdF = (event.metaKey || event.ctrlKey) && event.key === "f";
      if (isCmdF) {
        event.preventDefault();
        event.stopPropagation();
        if (viewMode === "split") {
          editorRef.current?.focus();
          editorRef.current?.getAction("actions.find")?.run();
        } else {
          setPreviewFindOpen(true);
        }
        return;
      }

      if (event.key === "Escape" && previewFindOpen) {
        event.preventDefault();
        handlePreviewFindClose();
      }
    },
    [editorRef, handlePreviewFindClose, previewFindOpen, setPreviewFindOpen, viewMode],
  );

  const handleStartSplitDrag = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!splitContainerRef.current) {
      return;
    }

    event.preventDefault();
    const rect = splitContainerRef.current.getBoundingClientRect();
    const minRatio = 0.2;
    const maxRatio = 0.8;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const x = moveEvent.clientX - rect.left;
      const rawRatio = x / rect.width;
      const clampedRatio = Math.min(maxRatio, Math.max(minRatio, rawRatio));
      setEditorPaneRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);

  useGitGutterDecorations({
    editor: editorInstance,
    workspaceId,
    path,
    worktreePath,
    currentContent,
    isIgnored,
  });

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <FileViewerToolbar
        path={path}
        onCopyPath={onCopyPath}
        onOpenExternalApp={onOpenExternalApp}
        openExternalAppLabel={openExternalAppLabel}
        statusContent={
          isDeleted ? (
            <Typography variant="caption" color="error.main" sx={{ mr: 1 }}>
              File deleted
            </Typography>
          ) : null
        }
        actions={isMarkdown ? <MarkdownViewModeActions currentMode={viewMode} onSelect={setViewMode} /> : undefined}
      />

      <Box ref={splitContainerRef} sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
        <Box
          ref={editorHostRef}
          sx={{
            flex: showPreview && showEditor ? `0 0 ${Math.round(editorPaneRatio * 100)}%` : showEditor ? 1 : 0,
            minHeight: 0,
            minWidth: 0,
            display: showEditor ? "block" : "none",
          }}
        />

        {showEditor && showPreview ? (
          <Box
            role="separator"
            aria-orientation="vertical"
            onMouseDown={handleStartSplitDrag}
            sx={{
              width: 8,
              cursor: "col-resize",
              position: "relative",
              flexShrink: 0,
              "&::before": {
                content: '""',
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                top: 0,
                bottom: 0,
                width: "1px",
                bgcolor: "divider",
              },
              "&:hover::before": {
                bgcolor: "primary.main",
              },
            }}
          />
        ) : null}

        {isMarkdown && showPreview ? (
          <MarkdownPreviewPane
            path={path}
            content={content}
            worktreePath={worktreePath}
            isDeleted={isDeleted}
            showEditor={showEditor}
            editorPaneRatio={editorPaneRatio}
            immediateUpdateToken={markdownPreviewImmediateUpdateToken}
            findOpen={previewFindOpen}
            findQuery={previewFindQuery}
            findActiveIndex={previewFindActiveIndex}
            onKeyDown={handlePreviewKeyDown}
            onContentChange={handleMarkdownPreviewContentChange}
            onFindMatchCountChange={handlePreviewFindMatchCountChange}
            onFindQueryChange={handlePreviewFindQueryChange}
            onFindNext={handlePreviewFindNext}
            onFindPrev={handlePreviewFindPrev}
            onFindClose={handlePreviewFindClose}
          />
        ) : null}
      </Box>
    </Box>
  );
}
