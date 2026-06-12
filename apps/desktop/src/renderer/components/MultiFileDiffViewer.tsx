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
  LuDiff,
  LuExternalLink,
  LuFileText,
  LuSearch,
  LuStretchHorizontal,
  LuStretchVertical,
  LuWrapText,
} from "react-icons/lu";
import { findDiffMatches } from "../helpers/diffSearch";
import type { DiffMatch } from "../helpers/diffSearch";
import { YISHAN_DIFF_THEME_DARK, YISHAN_DIFF_THEME_LIGHT, getDiffCssVariables } from "../helpers/diffTheme";
import type { FileDiffEntry } from "../store/types";
import { DiffSearchPanel } from "./DiffSearchPanel";
import { getFileTreeIcon } from "./fileTreeIcons";

type MultiFileDiffViewerProps = {
  files: FileDiffEntry[];
  onOpenFile?: (filePath: string) => void;
};

export type { FileDiffEntry };

type CustomHeaderItem = {
  id: string;
  fileDiff?: { name: string; type: string };
  file?: { name: string };
};

function getChangeKindLabel(changeKind: string | undefined): string {
  if (changeKind === "added") return "Added";
  if (changeKind === "deleted") return "Deleted";
  if (changeKind === "renamed") return "Renamed";
  return "";
}

function OpenFileButton({
  filePath,
  onOpenFile,
}: {
  filePath: string;
  onOpenFile: (path: string) => void;
}) {
  const elRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const handler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      onOpenFile(filePath);
    };

    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [filePath, onOpenFile]);

  return (
    <button
      ref={elRef}
      type="button"
      title="Open file"
      style={{
        display: "inline-flex",
        alignItems: "center",
        cursor: "pointer",
        flexShrink: 0,
        margin: 0,
        marginLeft: 4,
        padding: 2,
        border: "none",
        background: "none",
        color: "inherit",
        opacity: 0.5,
        lineHeight: 1,
      }}
    >
      <LuExternalLink size={12} />
    </button>
  );
}

function DiffFileHeader({
  filePath,
  fileName,
  changeKind,
  additions,
  deletions,
  isCollapsed,
  onToggle,
  onOpenFile,
}: {
  filePath: string;
  fileName: string;
  changeKind?: string;
  additions: number;
  deletions: number;
  isCollapsed: boolean;
  onToggle: (path: string) => void;
  onOpenFile?: (path: string) => void;
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

  const changeKindLabel = getChangeKindLabel(changeKind);

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

      {onOpenFile && <OpenFileButton filePath={filePath} onOpenFile={onOpenFile} />}
    </div>
  );
}

export function MultiFileDiffViewer({ files, onOpenFile }: MultiFileDiffViewerProps) {
  const theme = useTheme();
  const codeViewRef = useRef<CodeViewHandle<undefined>>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const f of files) {
      if (f.changeKind === "deleted") initial.add(f.path);
    }
    return initial;
  });
  const [sideBySide, setSideBySide] = useState(false);
  const [changesOnly, setChangesOnly] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);

  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const collapsedKeysRef = useRef(collapsedKeys);
  collapsedKeysRef.current = collapsedKeys;

  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;

  const allExpanded = collapsedKeys.size === 0;
  const allCollapsed = collapsedKeys.size === files.length;

  const totalAdditions = useMemo(() => files.reduce((sum, f) => sum + f.additions, 0), [files]);
  const totalDeletions = useMemo(() => files.reduce((sum, f) => sum + f.deletions, 0), [files]);

  const diffTheme = theme.palette.mode === "dark" ? YISHAN_DIFF_THEME_DARK : YISHAN_DIFF_THEME_LIGHT;
  const diffCssVars = useMemo(() => getDiffCssVariables(theme.palette.mode), [theme.palette.mode]);

  const options = useMemo(
    () => ({
      theme: diffTheme,
      diffStyle: (sideBySide ? "split" : "unified") as "split" | "unified",
      expandUnchanged: !changesOnly,
      overflow: (wrapLines ? "wrap" : "scroll") as "wrap" | "scroll",
    }),
    [diffTheme, sideBySide, changesOnly, wrapLines],
  );

  const searchFiles = useMemo(
    () =>
      files.map((f) => ({
        oldContent: f.oldContent,
        newContent: f.newContent,
        fileId: f.path,
      })),
    [files],
  );

  const searchMatches = useMemo(
    () => findDiffMatches(searchFiles, searchQuery, false, sideBySide),
    [searchFiles, searchQuery, sideBySide],
  );

  const currentMatch: DiffMatch | undefined = searchMatches[currentMatchIndex];

  useEffect(() => {
    const handle = codeViewRef.current;
    if (!handle || !currentMatch) return;

    handle.scrollTo({
      type: "line",
      id: currentMatch.fileId,
      lineNumber: currentMatch.visualLineNumber,
      side: currentMatch.side,
      align: "center",
    });

    handle.setSelectedLines({
      id: currentMatch.fileId,
      range: {
        start: currentMatch.visualLineNumber,
        side: currentMatch.side,
        end: currentMatch.visualLineNumber,
      },
    });
  }, [currentMatch]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        setSearchActive(true);
      }
      if (event.key === "Escape" && searchActive) {
        setSearchActive(false);
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [searchActive]);

  const handleSearchClose = useCallback(() => {
    setSearchActive(false);
    setSearchQuery("");
    const handle = codeViewRef.current;
    handle?.clearSelectedLines();
  }, []);

  const handleSearchPrevious = useCallback(() => {
    setCurrentMatchIndex((prev) => (prev <= 0 ? searchMatches.length - 1 : prev - 1));
  }, [searchMatches.length]);

  const handleSearchNext = useCallback(() => {
    setCurrentMatchIndex((prev) => (prev >= searchMatches.length - 1 ? 0 : prev + 1));
  }, [searchMatches.length]);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentMatchIndex(0);
  }, []);

  const initialItems: CodeViewDiffItem[] = useMemo(
    () =>
      files.map((file) => ({
        id: file.path,
        type: "diff" as const,
        fileDiff: parseDiffFromFile(
          { name: file.path, contents: file.oldContent },
          { name: file.path, contents: file.newContent },
        ),
        collapsed: file.changeKind === "deleted",
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

  const handleToggleChangesOnly = useCallback(() => {
    setChangesOnly((prev) => !prev);
  }, []);

  const fileMetaByPath = useMemo(() => {
    const map = new Map<string, { additions: number; deletions: number; changeKind: string }>();
    for (const f of files) {
      map.set(f.path, { additions: f.additions, deletions: f.deletions, changeKind: f.changeKind });
    }
    return map;
  }, [files]);

  const renderCustomHeader = useCallback(
    (item: CustomHeaderItem) => {
      const filePath = item.id;
      const isCollapsed = collapsedKeysRef.current.has(filePath);
      const meta = fileMetaByPath.get(filePath);
      const name = item.fileDiff?.name ?? item.file?.name ?? filePath;
      return (
        <DiffFileHeader
          filePath={filePath}
          fileName={name}
          changeKind={meta?.changeKind}
          additions={meta?.additions ?? 0}
          deletions={meta?.deletions ?? 0}
          isCollapsed={isCollapsed}
          onToggle={handleToggleFile}
          onOpenFile={onOpenFileRef.current}
        />
      );
    },
    [handleToggleFile, fileMetaByPath],
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
          <IconButton size="small" onClick={() => setSideBySide((prev) => !prev)} sx={{ ml: 0.25 }}>
            {sideBySide ? <LuStretchVertical size={14} /> : <LuStretchHorizontal size={14} />}
          </IconButton>
        </Tooltip>

        <Tooltip title={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}>
          <IconButton size="small" onClick={() => setWrapLines((prev) => !prev)} sx={{ ml: 0.25 }}>
            <LuWrapText size={14} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Find in diff (Ctrl+F)">
          <IconButton size="small" onClick={() => setSearchActive((prev) => !prev)} sx={{ ml: 0.25 }}>
            <LuSearch size={14} />
          </IconButton>
        </Tooltip>
      </Box>

      {searchActive && (
        <DiffSearchPanel
          query={searchQuery}
          onQueryChange={handleSearchQueryChange}
          onPrevious={handleSearchPrevious}
          onNext={handleSearchNext}
          onClose={handleSearchClose}
          matchCount={searchMatches.length}
          currentMatchIndex={currentMatchIndex}
          autoFocus
        />
      )}

      <Box sx={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        {files.length > 0 && (
          <CodeView
            ref={codeViewRef}
            initialItems={initialItems}
            style={
              {
                position: "absolute",
                inset: 0,
                overflow: "auto",
                "--diffs-font-family": '"JetBrains Mono", "SF Mono", Menlo, monospace',
                "--diffs-font-size": "13px",
                "--diffs-line-height": "20px",
                ...diffCssVars,
              } as React.CSSProperties
            }
            options={options}
            renderCustomHeader={renderCustomHeader}
          />
        )}
      </Box>
    </Box>
  );
}
