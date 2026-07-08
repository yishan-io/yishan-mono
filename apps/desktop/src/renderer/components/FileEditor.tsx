import { Box, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuCode, LuColumns2, LuEye } from "react-icons/lu";
import { getLanguageId, isMarkdownFile } from "../helpers/editorLanguage";
import { YISHAN_THEME_DARK, YISHAN_THEME_LIGHT, ensureEditorThemes, monaco } from "../helpers/monacoSetup";
import { useGitGutterDecorations } from "../hooks/useGitGutterDecorations";
import type { MarkdownDefaultViewMode } from "../store/settings/layoutStore";
import { FileViewerToolbar } from "./FileViewerToolbar";
import { MarkdownPreview } from "./MarkdownPreview";
import { MarkdownPreviewThemeProvider } from "./MarkdownPreviewThemeProvider";

type MarkdownViewMode = "edit" | "split" | "preview";

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

/** Renders a Monaco file editor with local edit tracking and Cmd/Ctrl+S save shortcut.
 *  For Markdown files, supports split-pane and preview-only modes. */
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
  const theme = useTheme();
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef(content);
  const onContentChangeRef = useRef(onContentChange);
  const onSaveRef = useRef(onSave);

  const isMarkdown = useMemo(() => isMarkdownFile(path), [path]);
  const [viewMode, setViewMode] = useState<MarkdownViewMode>(() =>
    isMarkdownFile(path) ? defaultMarkdownViewMode : "edit",
  );
  const previousMarkdownDefaultModeRef = useRef(defaultMarkdownViewMode);
  const [editorPaneRatio, setEditorPaneRatio] = useState(0.5);
  const [markdownPreviewImmediateUpdateToken, setMarkdownPreviewImmediateUpdateToken] = useState(0);

  // Preview find bar state — owned here so FileEditor can intercept Cmd+F.
  const [previewFindOpen, setPreviewFindOpen] = useState(false);
  const [previewFindQuery, setPreviewFindQuery] = useState("");
  const [previewFindMatchCount, setPreviewFindMatchCount] = useState(0);
  const [previewFindActiveIndex, setPreviewFindActiveIndex] = useState(0);

  // Reset view mode when switching between markdown and non-markdown files.
  // When entering a markdown file from a non-markdown file (viewMode is "edit"),
  // use user-configured markdown default. When leaving markdown, always reset to "edit".
  useEffect(() => {
    if (isMarkdown) {
      setViewMode((prev) => (prev === "edit" ? defaultMarkdownViewMode : prev));
    } else {
      setViewMode("edit");
    }
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

  const monacoTheme = useMemo(
    () => (theme.palette.mode === "dark" ? YISHAN_THEME_DARK : YISHAN_THEME_LIGHT),
    [theme.palette.mode],
  );

  // Track the current editor content for git gutter decorations.
  const [currentContent, setCurrentContent] = useState(content);

  const showEditor = viewMode === "edit" || viewMode === "split";
  const showPreview = viewMode === "preview" || viewMode === "split";

  useEffect(() => {
    contentRef.current = content;
    setCurrentContent(content);
  }, [content]);

  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Create and destroy the editor instance.
  useEffect(() => {
    if (!editorHostRef.current) return;

    ensureEditorThemes();

    const language = getLanguageId(path) ?? undefined;

    // Create a model with a file:// URI matching the real file path so that
    // Monaco's language services (e.g. TypeScript) can resolve relative imports
    // and understand the project structure even when the file lives outside the app.
    const fileUri = monaco.Uri.file(path);
    const existingModel = monaco.editor.getModel(fileUri);
    const model = existingModel ?? monaco.editor.createModel(contentRef.current, language, fileUri);

    if (existingModel) {
      // Reuse existing model but update language if needed.
      monaco.editor.setModelLanguage(model, language ?? "plaintext");
      model.setValue(contentRef.current);
    }

    const editor = monaco.editor.create(editorHostRef.current, {
      model,
      theme: monacoTheme,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      lineHeight: 1.5,
      wordWrap: "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 12 },
      renderLineHighlight: "line",
      tabSize: 2,
      insertSpaces: true,
      readOnly: isDeleted,
    });

    // Register Cmd/Ctrl+S save shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void onSaveRef.current?.(editor.getValue());
    });

    // Listen for content changes
    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      setCurrentContent(value);
      onContentChangeRef.current?.(value);
    });

    editorRef.current = editor;
    setEditorInstance(editor);

    return () => {
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      setEditorInstance(null);
    };
  }, [isDeleted, monacoTheme, path]);

  // Sync external content changes into the editor.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentValue = editor.getValue();
    if (currentValue === content) return;

    editor.setValue(content);
  }, [content]);

  // Update theme without recreating the editor.
  useEffect(() => {
    monaco.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  useEffect(() => {
    editorRef.current?.updateOptions?.({ readOnly: isDeleted });
  }, [isDeleted]);

  // Focus the editor when requested.
  useEffect(() => {
    if (focusRequestKey <= 0) return;

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusRequestKey]);

  // Trigger Monaco layout when the editor pane visibility changes, so it
  // recalculates its dimensions after being hidden/shown.
  useEffect(() => {
    void editorPaneRatio;
    if (showEditor) {
      const frame = window.requestAnimationFrame(() => {
        editorRef.current?.layout();
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [showEditor, editorPaneRatio]);

  const handleSetViewMode = useCallback((mode: MarkdownViewMode) => {
    setViewMode(mode);
  }, []);

  // Close the preview find bar when leaving preview-only mode.
  useEffect(() => {
    if (viewMode !== "preview") {
      setPreviewFindOpen(false);
      setPreviewFindQuery("");
      setPreviewFindActiveIndex(0);
    }
  }, [viewMode]);

  /** Handles Cmd+F / Ctrl+F keydown on the preview pane.
   *  In split mode: focuses the Monaco editor and opens its built-in find widget.
   *  In preview-only mode: opens the in-preview find bar.
   *  Escape closes the find bar when it is open. */
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
        setPreviewFindOpen(false);
        setPreviewFindQuery("");
        setPreviewFindActiveIndex(0);
      }
    },
    [viewMode, previewFindOpen],
  );

  const handleMarkdownPreviewContentChange = useCallback((nextContent: string) => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== nextContent) {
      setMarkdownPreviewImmediateUpdateToken((token) => token + 1);
      editor.setValue(nextContent);
      return;
    }

    setMarkdownPreviewImmediateUpdateToken((token) => token + 1);
    setCurrentContent(nextContent);
    onContentChangeRef.current?.(nextContent);
  }, []);

  // Apply git gutter decorations showing added/modified/deleted lines.
  useGitGutterDecorations({
    editor: editorInstance,
    workspaceId,
    path,
    worktreePath,
    currentContent,
    isIgnored,
  });

  const handleStartSplitDrag = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!splitContainerRef.current) {
      return;
    }

    event.preventDefault();
    const container = splitContainerRef.current;
    const rect = container.getBoundingClientRect();
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
        actions={
          isMarkdown ? (
            <>
              <MarkdownViewModeToggle
                mode="edit"
                currentMode={viewMode}
                icon={<LuCode size={14} />}
                tooltip="Source editor"
                onSelect={handleSetViewMode}
              />
              <MarkdownViewModeToggle
                mode="split"
                currentMode={viewMode}
                icon={<LuColumns2 size={14} />}
                tooltip="Split view"
                onSelect={handleSetViewMode}
              />
              <MarkdownViewModeToggle
                mode="preview"
                currentMode={viewMode}
                icon={<LuEye size={14} />}
                tooltip="Preview"
                onSelect={handleSetViewMode}
              />
              <Box sx={{ width: "1px", height: 14, bgcolor: "divider", mx: 0.5 }} />
            </>
          ) : undefined
        }
      />

      {/* Content area */}
      <Box ref={splitContainerRef} sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
        {/* Monaco editor pane */}
        <Box
          ref={editorHostRef}
          sx={{
            flex: showPreview && showEditor ? `0 0 ${Math.round(editorPaneRatio * 100)}%` : showEditor ? 1 : 0,
            minHeight: 0,
            minWidth: 0,
            display: showEditor ? "block" : "none",
          }}
        />

        {/* Divider between editor and preview */}
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

        {/* Markdown preview pane */}
        {isMarkdown && showPreview ? (
          <Box
            data-testid="markdown-preview-pane"
            onKeyDown={handlePreviewKeyDown}
            tabIndex={0}
            sx={{
              flex: showEditor ? `0 0 ${Math.round((1 - editorPaneRatio) * 100)}%` : 1,
              minHeight: 0,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              outline: "none",
            }}
          >
            <MarkdownPreviewThemeProvider>
              <MarkdownPreview
                content={content}
                filePath={path}
                worktreePath={worktreePath}
                canEdit={!isDeleted}
                onContentChange={handleMarkdownPreviewContentChange}
                immediateUpdateToken={markdownPreviewImmediateUpdateToken}
                findOpen={previewFindOpen}
                findQuery={previewFindQuery}
                findActiveIndex={previewFindActiveIndex}
                onFindMatchCountChange={(count) => {
                  setPreviewFindMatchCount(count);
                  setPreviewFindActiveIndex((i) => Math.min(i, Math.max(0, count - 1)));
                }}
                onFindQueryChange={(q) => {
                  setPreviewFindQuery(q);
                  setPreviewFindActiveIndex(0);
                }}
                onFindNext={() =>
                  setPreviewFindActiveIndex((i) => (previewFindMatchCount > 0 ? (i + 1) % previewFindMatchCount : 0))
                }
                onFindPrev={() =>
                  setPreviewFindActiveIndex((i) =>
                    previewFindMatchCount > 0 ? (i - 1 + previewFindMatchCount) % previewFindMatchCount : 0,
                  )
                }
                onFindClose={() => {
                  setPreviewFindOpen(false);
                  setPreviewFindQuery("");
                  setPreviewFindActiveIndex(0);
                }}
              />
            </MarkdownPreviewThemeProvider>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

/** A single toggle button for switching Markdown view modes. */
function MarkdownViewModeToggle({
  mode,
  currentMode,
  icon,
  tooltip,
  onSelect,
}: {
  mode: MarkdownViewMode;
  currentMode: MarkdownViewMode;
  icon: React.ReactNode;
  tooltip: string;
  onSelect: (mode: MarkdownViewMode) => void;
}) {
  const isActive = mode === currentMode;

  return (
    <Tooltip title={tooltip} arrow>
      <span>
        <IconButton
          size="small"
          aria-label={tooltip}
          aria-pressed={isActive}
          onClick={() => onSelect(mode)}
          sx={{
            p: 0.375,
            color: isActive ? "primary.main" : "text.secondary",
            bgcolor: isActive ? "action.selected" : "transparent",
            borderRadius: 0.75,
            "&:hover": {
              bgcolor: isActive ? "action.selected" : "action.hover",
            },
          }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}
