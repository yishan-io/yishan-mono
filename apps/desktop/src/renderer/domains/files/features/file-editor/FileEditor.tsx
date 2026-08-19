import { Box, Typography } from "@mui/material";
import { isExcalidrawFile } from "@renderer/domains/files";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { CliSpinner } from "../../../../ui/components/CliSpinner";
import { useGitGutterDecorations } from "../file-manager/useGitGutterDecorations";
import { FileViewerToolbar } from "./FileViewerToolbar";
import { MarkdownViewToggle } from "./MarkdownViewToggle";
import type { VditorFileEditorHandle } from "./VditorFileEditor";
import { useMonacoFileEditor } from "./useMonacoFileEditor";

export type FileEditorProps = {
  workspaceId?: string;
  path: string;
  content: string;
  worktreePath?: string;
  isDeleted?: boolean;
  /** When true, diff gutter decorations are suppressed (file is git-ignored). */
  isIgnored?: boolean;
  focusRequestKey?: number;
  onContentChange?: (content: string) => void;
  onSave?: (content: string) => void | Promise<void>;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

/**
 * Renders the file tab editor: Monaco for code files, the Vditor IR editor for
 * markdown files (no Monaco instance, no preview modes — markdown is edited
 * directly in the WYSIWYG surface).
 */
function MonacoFileEditor({
  workspaceId,
  path,
  content,
  worktreePath,
  isDeleted = false,
  isIgnored = false,
  focusRequestKey = 0,
  onContentChange,
  onSave,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: FileEditorProps) {
  const fileEditorRootRef = useRef<HTMLDivElement | null>(null);
  const wysiwygHandleRef = useRef<VditorFileEditorHandle | null>(null);
  const showWysiwygEditorRef = useRef(false);
  // View-only toggle for markdown files (renders the WYSIWYG surface
  // read-only, replacing the old preview mode).
  const [markdownViewOnly, setMarkdownViewOnly] = useState(false);
  const {
    editorHostRef,
    editorRef,
    editorInstance,
    currentContent,
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

  // Markdown always uses the Vditor WYSIWYG editor — no Monaco, no preview modes.
  const showWysiwygEditor = isMarkdown;
  showWysiwygEditorRef.current = showWysiwygEditor;

  useEffect(() => {
    if (isMarkdown) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.layout();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [editorRef, isMarkdown]);

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
      // root. Intercepting in the capture phase also keeps Monaco's internal
      // keybinding service from seeing the event.
      event.preventDefault();
      event.stopPropagation();

      // For markdown the save content lives in the Vditor editor — flush it
      // into the shared content source (contentRef / onContentChange) before
      // the save handler reads it.
      if (showWysiwygEditorRef.current) {
        wysiwygHandleRef.current?.flushNow();
      }

      handleSaveCurrentContent();
    };

    rootElement.addEventListener("keydown", handleNativeKeyDown, true);
    return () => {
      rootElement.removeEventListener("keydown", handleNativeKeyDown, true);
    };
  }, [handleSaveCurrentContent, isDeleted]);

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
        actions={
          isMarkdown ? <MarkdownViewToggle viewOnly={markdownViewOnly} onToggle={setMarkdownViewOnly} /> : undefined
        }
      />
      <Box
        ref={editorHostRef}
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "block",
          position: "relative",
        }}
      >
        {showWysiwygEditor ? (
          <Suspense
            fallback={
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  position: "absolute",
                  top: 0,
                  left: 0,
                }}
              />
            }
          >
            <VditorFileEditor
              ref={wysiwygHandleRef}
              key={path}
              path={path}
              content={content}
              isDeleted={isDeleted}
              readOnly={markdownViewOnly}
              focusRequestKey={focusRequestKey}
              isDark={isDark}
              onContentChange={handleMarkdownPreviewContentChange}
            />
          </Suspense>
        ) : null}
      </Box>
    </Box>
  );
}

const VditorFileEditor = lazy(() => import("./VditorFileEditor").then((m) => ({ default: m.VditorFileEditor })));
const ExcalidrawFileEditor = lazy(() => import("./ExcalidrawFileEditor"));

/** Dispatches to the Excalidraw editor for .excalidraw files, or Monaco/Vditor for all others. */
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
