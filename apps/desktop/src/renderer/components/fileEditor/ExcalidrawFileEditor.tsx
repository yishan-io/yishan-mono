import { Box, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { useCodeTheme } from "../../ui/hooks/useCodeTheme";
import { FileViewerToolbar } from "../FileViewerToolbar";
import { ExcalidrawFilePane } from "./ExcalidrawFilePane";
import { useExcalidrawSceneSync } from "./useExcalidrawSceneSync";

export type ExcalidrawFileEditorProps = {
  workspaceId?: string;
  path: string;
  content: string;
  worktreePath?: string;
  isDeleted?: boolean;
  /** Unused by Excalidraw editor; accepted for prop-contract compatibility. */
  isIgnored?: boolean;
  focusRequestKey?: number;
  onContentChange?: (content: string) => void;
  onSave?: (content: string) => void | Promise<void>;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

/**
 * Full-page Excalidraw file editor with toolbar, keyboard shortcuts, and
 * bidirectional scene-content sync.
 *
 * This is the lazy-load boundary for the Excalidraw package — Task 4 hooks it
 * into `useTabContentRenderer` via `React.lazy`.
 */
export default function ExcalidrawFileEditor({
  path,
  content,
  isDeleted = false,
  onContentChange,
  onSave,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: ExcalidrawFileEditorProps) {
  const { mode } = useCodeTheme();
  const theme = mode === "dark" ? "dark" : "light";

  const fileEditorRootRef = useRef<HTMLDivElement | null>(null);

  // ── Stable refs for callbacks (mirrors FileEditor pattern) ──
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const { initialData, parseError, handleChange, getSaveContent, onCanvasReady } = useExcalidrawSceneSync({
    content,
    onContentChange: (json) => onContentChangeRef.current?.(json),
  });

  // ── Native Cmd/Ctrl+S capture handler ──
  useEffect(() => {
    const rootElement = fileEditorRootRef.current;
    if (!rootElement) {
      return;
    }

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      const isCmdS = (event.metaKey || event.ctrlKey) && (event.code === "KeyS" || event.key.toLowerCase() === "s");
      if (!isCmdS || isDeleted) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const saveContent = getSaveContent();
      // fire-and-forget: keyboard handlers cannot await the caller-owned save operation.
      void onSaveRef.current?.(saveContent);
    };

    rootElement.addEventListener("keydown", handleNativeKeyDown, true);
    return () => {
      rootElement.removeEventListener("keydown", handleNativeKeyDown, true);
    };
  }, [getSaveContent, isDeleted]);

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
      />
      <ExcalidrawFilePane
        initialData={initialData}
        theme={theme}
        onCanvasReady={onCanvasReady}
        onCanvasChange={handleChange}
        parseError={parseError}
      />
    </Box>
  );
}
