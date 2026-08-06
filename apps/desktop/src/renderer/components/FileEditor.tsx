import { Box, Typography } from "@mui/material";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { isExcalidrawFile } from "../helpers/editorLanguage";
import { useGitGutterDecorations } from "../hooks/useGitGutterDecorations";
import type { MarkdownDefaultViewMode } from "../store/settings/layoutStore";
import { CliSpinner } from "./CliSpinner";
import { FileViewerToolbar } from "./FileViewerToolbar";
import { MarkdownPreviewPane } from "./fileEditor/MarkdownPreviewPane";
import { MarkdownViewModeActions } from "./fileEditor/MarkdownViewModeActions";
import { useMarkdownViewMode } from "./fileEditor/useMarkdownViewMode";
import { useMonacoFileEditor } from "./fileEditor/useMonacoFileEditor";

export type FileEditorProps = {
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
function MonacoFileEditor({
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
  const fileEditorRootRef = useRef<HTMLDivElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [editorPaneRatio, setEditorPaneRatio] = useState(0.5);
  const {
    editorHostRef,
    editorRef,
    editorInstance,
    currentContent,
    markdownPreviewImmediateUpdateToken,
    isMarkdown,
    isDark,
    editorFontSize,
    handleSaveCurrentContent,
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

  const handleMarkdownPreviewChangeAndSave = useCallback(
    (nextContent: string) => {
      handleMarkdownPreviewContentChange(nextContent);
      if (!isDeleted) {
        handleSaveCurrentContent();
      }
    },
    [handleMarkdownPreviewContentChange, handleSaveCurrentContent, isDeleted],
  );

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

  useEffect(() => {
    const rootElement = fileEditorRootRef.current;
    if (!rootElement) {
      return;
    }

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      // Match the physical S key position (layout-independent, like Monaco's
      // prior keyCode-based binding) with an event.key fallback for IMEs that
      // leave event.code empty.
      const isCmdS = (event.metaKey || event.ctrlKey) && (event.code === "KeyS" || event.key.toLowerCase() === "s");
      if (!isCmdS || isDeleted) {
        return;
      }

      // Single Cmd/Ctrl+S save path for every focus target inside the editor
      // root (toolbar, preview DOM, Monaco). Intercepting in the capture phase
      // also keeps Monaco's internal keybinding service from seeing the event.
      event.preventDefault();
      event.stopPropagation();
      handleSaveCurrentContent();
    };

    rootElement.addEventListener("keydown", handleNativeKeyDown, true);
    return () => {
      rootElement.removeEventListener("keydown", handleNativeKeyDown, true);
    };
  }, [handleSaveCurrentContent, isDeleted]);

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
    isDark,
    editorFontSize,
  });

  return (
    <Box ref={fileEditorRootRef} sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <FileViewerToolbar
        path={path}
        onCopyPath={onCopyPath}
        onOpenExternalApp={onOpenExternalApp}
        openExternalAppLabel={openExternalAppLabel}
        statusContent={
          isDeleted ? (
            <Typography
              variant="caption"
              sx={{
                color: "error.main",
                mr: 1,
              }}
            >
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
            onContentChange={handleMarkdownPreviewChangeAndSave}
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

const ExcalidrawFileEditor = lazy(() => import("./fileEditor/ExcalidrawFileEditor"));

/** Dispatches to the Excalidraw editor for .excalidraw files, or Monaco for all others. */
export function FileEditor(props: FileEditorProps) {
  if (isExcalidrawFile(props.path)) {
    return (
      <Suspense
        fallback={
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CliSpinner />
          </Box>
        }
      >
        <ExcalidrawFileEditor {...props} />
      </Suspense>
    );
  }

  return <MonacoFileEditor {...props} />;
}
