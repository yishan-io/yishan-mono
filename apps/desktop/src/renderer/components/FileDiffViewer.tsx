import { Box, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { parseDiffFromFile } from "@pierre/diffs";
import type { SelectedLineRange } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuDiff,
  LuExternalLink,
  LuFileText,
  LuSearch,
  LuStretchHorizontal,
  LuStretchVertical,
  LuWrapText,
} from "react-icons/lu";
import { isBinaryPath } from "../helpers/binaryExtensions";
import { findDiffMatches } from "../helpers/diffSearch";
import { YISHAN_DIFF_THEME_DARK, YISHAN_DIFF_THEME_LIGHT, getDiffCssVariables } from "../helpers/diffTheme";
import { DiffSearchPanel } from "./DiffSearchPanel";

type FileDiffViewerProps = {
  filePath: string;
  oldContent: string;
  newContent: string;
  onOpenFile?: (filePath: string) => void;
};

const DIFF_LINE_HEIGHT = 20;

export function FileDiffViewer({ filePath, oldContent, newContent, onOpenFile }: FileDiffViewerProps) {
  const theme = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [sideBySide, setSideBySide] = useState(false);
  const [changesOnly, setChangesOnly] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);

  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const handleToggleChangesOnly = useCallback(() => {
    setChangesOnly((prev) => !prev);
  }, []);

  const fileDiff = useMemo(
    () => parseDiffFromFile({ name: filePath, contents: oldContent }, { name: filePath, contents: newContent }),
    [filePath, oldContent, newContent],
  );

  const diffTheme = theme.palette.mode === "dark" ? YISHAN_DIFF_THEME_DARK : YISHAN_DIFF_THEME_LIGHT;
  const diffCssVars = useMemo(() => getDiffCssVariables(theme.palette.mode), [theme.palette.mode]);

  const searchFiles = useMemo(() => [{ oldContent, newContent, fileId: filePath }], [oldContent, newContent, filePath]);

  const searchMatches = useMemo(
    () => findDiffMatches(searchFiles, searchQuery, false, sideBySide),
    [searchFiles, searchQuery, sideBySide],
  );

  const selectedLines: SelectedLineRange | null = useMemo(() => {
    const match = searchMatches[currentMatchIndex];
    if (!match) return null;
    return {
      start: match.visualLineNumber,
      side: match.side,
      end: match.visualLineNumber,
    };
  }, [searchMatches, currentMatchIndex]);

  useEffect(() => {
    const match = searchMatches[currentMatchIndex];
    if (!match) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollTop = Math.max(0, (match.visualLineNumber - 1) * DIFF_LINE_HEIGHT - container.clientHeight / 2);
    container.scrollTop = scrollTop;
  }, [searchMatches, currentMatchIndex]);

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

  if (isBinaryPath(filePath)) {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ color: "text.secondary", fontSize: 13 }}>Binary file: {filePath}</Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
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
          justifyContent: "flex-end",
          gap: 0.25,
          bgcolor: (muiTheme) =>
            muiTheme.palette.mode === "dark" ? "background.default" : muiTheme.palette.background.paper,
        }}
      >
        <Tooltip title={changesOnly ? "Show entire file" : "Show changes only"}>
          <IconButton size="small" onClick={handleToggleChangesOnly}>
            {changesOnly ? <LuFileText size={14} /> : <LuDiff size={14} />}
          </IconButton>
        </Tooltip>
        <Tooltip title={sideBySide ? "Switch to inline view" : "Switch to side-by-side view"}>
          <IconButton size="small" onClick={() => setSideBySide((prev) => !prev)} sx={{ ml: 0.5 }}>
            {sideBySide ? <LuStretchVertical size={14} /> : <LuStretchHorizontal size={14} />}
          </IconButton>
        </Tooltip>
        <Tooltip title={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}>
          <IconButton size="small" onClick={() => setWrapLines((prev) => !prev)} sx={{ ml: 0.5 }}>
            <LuWrapText size={14} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Find in diff (Ctrl+F)">
          <IconButton size="small" onClick={() => setSearchActive((prev) => !prev)} sx={{ ml: 0.5 }}>
            <LuSearch size={14} />
          </IconButton>
        </Tooltip>
        {onOpenFile && (
          <Tooltip title="Open file">
            <IconButton size="small" onClick={() => onOpenFile(filePath)} sx={{ ml: 0.5 }}>
              <LuExternalLink size={14} />
            </IconButton>
          </Tooltip>
        )}
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

      <Box ref={scrollContainerRef} sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <FileDiff
          fileDiff={fileDiff}
          selectedLines={selectedLines}
          style={
            {
              minHeight: "100%",
              "--diffs-font-family": '"JetBrains Mono", "SF Mono", Menlo, monospace',
              "--diffs-font-size": "13px",
              "--diffs-line-height": `${DIFF_LINE_HEIGHT}px`,
              ...diffCssVars,
            } as React.CSSProperties
          }
          options={{
            theme: diffTheme,
            diffStyle: sideBySide ? "split" : "unified",
            expandUnchanged: !changesOnly,
            overflow: wrapLines ? "wrap" : "scroll",
            disableFileHeader: false,
          }}
        />
      </Box>
    </Box>
  );
}
