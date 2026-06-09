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
import { getFileTreeIcon } from "./fileTreeIcons";

type MultiFileDiffViewerProps = {
  files: FileDiffEntry[];
};

export type { FileDiffEntry };

type CustomHeaderItem = {
  id: string;
  fileDiff?: { name: string; type: string };
  file?: { name: string };
};

function getChangeKindLabel(changeType: string): string {
  if (changeType === "new") return "Added";
  if (changeType === "deleted") return "Deleted";
  if (changeType === "rename-pure" || changeType === "rename-changed") return "Renamed";
  return "";
}

function DiffFileHeader({
  filePath,
  fileName,
  changeType,
  additions,
  deletions,
  isCollapsed,
  onToggle,
}: {
  filePath: string;
  fileName: string;
  changeType: string;
  additions: number;
  deletions: number;
  isCollapsed: boolean;
  onToggle: (path: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle(filePath);
    };

    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [filePath, onToggle]);

  const changeKindLabel = getChangeKindLabel(changeType);

  return (
    <div
      ref={elRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        cursor: "pointer",
        userSelect: "none",
        minHeight: 28,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
        {isCollapsed ? <LuChevronRight size={14} /> : <LuChevronDown size={14} />}
      </span>

      {<img src={getFileTreeIcon(fileName, false)} alt="" style={{ width: 14, height: 14, flexShrink: 0 }} />}

      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {fileName}
      </span>

      {changeKindLabel && <span style={{ fontSize: 11, opacity: 0.6, flexShrink: 0 }}>{changeKindLabel}</span>}

      {additions > 0 && (
        <span style={{ fontSize: 11, color: "var(--diffs-addition-base, #0dbe4e)", flexShrink: 0 }}>+{additions}</span>
      )}
      {deletions > 0 && (
        <span style={{ fontSize: 11, color: "var(--diffs-deletion-base, #ff2e3f)", flexShrink: 0 }}>-{deletions}</span>
      )}
    </div>
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

  const fileStatsByPath = useMemo(() => {
    const map = new Map<string, { additions: number; deletions: number }>();
    for (const f of files) {
      map.set(f.path, { additions: f.additions, deletions: f.deletions });
    }
    return map;
  }, [files]);

  const renderCustomHeader = useCallback(
    (item: CustomHeaderItem) => {
      const filePath = item.id;
      const isCollapsed = collapsedKeysRef.current.has(filePath);
      const stats = fileStatsByPath.get(filePath);
      const name = item.fileDiff?.name ?? item.file?.name ?? filePath;
      const changeType = item.fileDiff?.type ?? "change";
      return (
        <DiffFileHeader
          filePath={filePath}
          fileName={name}
          changeType={changeType}
          additions={stats?.additions ?? 0}
          deletions={stats?.deletions ?? 0}
          isCollapsed={isCollapsed}
          onToggle={handleToggleFile}
        />
      );
    },
    [handleToggleFile, fileStatsByPath],
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
            renderCustomHeader={renderCustomHeader}
          />
        )}
      </Box>
    </Box>
  );
}
