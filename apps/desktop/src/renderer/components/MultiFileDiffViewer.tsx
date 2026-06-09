import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { parseDiffFromFile } from "@pierre/diffs";
import type { CodeViewDiffItem } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuChevronDown,
  LuChevronRight,
  LuChevronsDownUp,
  LuChevronsUpDown,
  LuColumns2,
  LuDiff,
  LuFileText,
  LuRows2,
} from "react-icons/lu";
import type { FileDiffEntry } from "../store/types";

type MultiFileDiffViewerProps = {
  files: FileDiffEntry[];
};

export type { FileDiffEntry };

function CollapseToggle({
  filePath,
  isCollapsed,
  onToggle,
}: {
  filePath: string;
  isCollapsed: boolean;
  onToggle: (path: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle(filePath);
    };

    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [filePath, onToggle]);

  return (
    <button
      ref={buttonRef}
      type="button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        cursor: "pointer",
        flexShrink: 0,
        margin: 0,
        marginRight: 4,
        padding: 0,
        border: "none",
        background: "none",
        color: "inherit",
        lineHeight: 1,
      }}
    >
      {isCollapsed ? <LuChevronRight size={14} /> : <LuChevronDown size={14} />}
    </button>
  );
}

export function MultiFileDiffViewer({ files }: MultiFileDiffViewerProps) {
  const theme = useTheme();
  const codeViewRef = useRef<CodeViewHandle<undefined>>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [sideBySide, setSideBySide] = useState(false);
  const [changesOnly, setChangesOnly] = useState(true);

  const collapsedKeysRef = useRef(collapsedKeys);
  collapsedKeysRef.current = collapsedKeys;

  const allExpanded = collapsedKeys.size === 0;
  const allCollapsed = collapsedKeys.size === files.length;

  const totalAdditions = useMemo(() => files.reduce((sum, f) => sum + f.additions, 0), [files]);
  const totalDeletions = useMemo(() => files.reduce((sum, f) => sum + f.deletions, 0), [files]);

  const diffTheme = theme.palette.mode === "dark" ? "pierre-dark" : "pierre-light";

  const options = useMemo(
    () => ({
      theme: diffTheme,
      diffStyle: (sideBySide ? "split" : "unified") as "split" | "unified",
      expandUnchanged: !changesOnly,
    }),
    [diffTheme, sideBySide, changesOnly],
  );

  const initialItems: CodeViewDiffItem[] = useMemo(
    () =>
      files.map((file) => ({
        id: file.path,
        type: "diff" as const,
        fileDiff: parseDiffFromFile(
          { name: file.path, contents: file.oldContent },
          { name: file.path, contents: file.newContent },
        ),
        collapsed: false,
        version: 0,
      })),
    [files],
  );

  useEffect(() => {
    const handle = codeViewRef.current;
    if (!handle) return;

    for (const filePath of files.map((f) => f.path)) {
      const item = handle.getItem(filePath);
      if (item && item.collapsed !== collapsedKeys.has(filePath)) {
        handle.updateItem({
          ...item,
          collapsed: collapsedKeys.has(filePath),
          version: (item.version ?? 0) + 1,
        });
      }
    }
  }, [collapsedKeys, files]);

  const handleToggleFile = useCallback((filePath: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const handleFoldAll = useCallback(() => {
    setCollapsedKeys(new Set(files.map((f) => f.path)));
  }, [files]);

  const handleUnfoldAll = useCallback(() => {
    setCollapsedKeys(new Set());
  }, []);

  const handleToggleLayout = useCallback(() => {
    setSideBySide((prev) => !prev);
  }, []);

  const handleToggleChangesOnly = useCallback(() => {
    setChangesOnly((prev) => !prev);
  }, []);

  const renderHeaderPrefix = useCallback(
    (item: { id: string }) => {
      const filePath = item.id;
      const isCollapsed = collapsedKeysRef.current.has(filePath);
      return <CollapseToggle filePath={filePath} isCollapsed={isCollapsed} onToggle={handleToggleFile} />;
    },
    [handleToggleFile],
  );

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          minHeight: 34,
          px: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          flexShrink: 0,
          bgcolor: (muiTheme) =>
            muiTheme.palette.mode === "dark" ? "background.default" : muiTheme.palette.background.paper,
        }}
      >
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
          {files.length} file{files.length !== 1 ? "s" : ""} changed
          {totalAdditions > 0 && (
            <Box component="span" sx={{ ml: 1, color: "success.main" }}>
              +{totalAdditions}
            </Box>
          )}
          {totalDeletions > 0 && (
            <Box component="span" sx={{ ml: 1, color: "error.main" }}>
              -{totalDeletions}
            </Box>
          )}
        </Typography>

        <Tooltip title={allExpanded ? "All files expanded" : "Fold all files"}>
          <Box component="span">
            <IconButton size="small" onClick={handleFoldAll} disabled={allCollapsed} sx={{ ml: 0.25 }}>
              <LuChevronsDownUp size={14} />
            </IconButton>
          </Box>
        </Tooltip>

        <Tooltip title={allCollapsed ? "All files collapsed" : "Unfold all files"}>
          <Box component="span">
            <IconButton size="small" onClick={handleUnfoldAll} disabled={allExpanded} sx={{ ml: 0.25 }}>
              <LuChevronsUpDown size={14} />
            </IconButton>
          </Box>
        </Tooltip>

        <Tooltip title={changesOnly ? "Show entire files" : "Show changes only"}>
          <IconButton size="small" onClick={handleToggleChangesOnly} sx={{ ml: 0.25 }}>
            {changesOnly ? <LuFileText size={14} /> : <LuDiff size={14} />}
          </IconButton>
        </Tooltip>

        <Tooltip title={sideBySide ? "Switch to inline view" : "Switch to side-by-side view"}>
          <IconButton size="small" onClick={handleToggleLayout} sx={{ ml: 0.25 }}>
            {sideBySide ? <LuRows2 size={14} /> : <LuColumns2 size={14} />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        {files.length > 0 && (
          <CodeView
            ref={codeViewRef}
            initialItems={initialItems}
            style={{ position: "absolute", inset: 0, overflow: "auto" }}
            options={options}
            renderHeaderPrefix={renderHeaderPrefix}
          />
        )}
      </Box>
    </Box>
  );
}
