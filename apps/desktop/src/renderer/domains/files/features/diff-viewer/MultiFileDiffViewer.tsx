import { Box } from "@mui/material";
import type { CodeViewDiffItem } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { getDiffCssVariablesForPalette } from "@renderer/domains/files";
import { editorSettingsStore } from "@renderer/domains/settings";
import { useCodeTheme } from "@renderer/domains/settings";
import type { FileDiffEntry } from "@renderer/domains/workbench";
import { MONO_FONT_FAMILY } from "@renderer/ui/codeThemes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffSearchPanel } from "./DiffSearchPanel";
import { MultiFileDiffViewerHeader } from "./MultiFileDiffViewerHeader";
import { MultiFileDiffViewerToolbar } from "./MultiFileDiffViewerToolbar";
import { findDiffMatches } from "./diffSearch";
import type { DiffMatch } from "./diffSearch";
import {
  createCodeViewItems,
  createFileMetaByPath,
  createInitialCollapsedKeys,
  getDiffTotals,
} from "./multiFileDiffViewerHelpers";

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

export function MultiFileDiffViewer({ files, onOpenFile }: MultiFileDiffViewerProps) {
  const { palette, themeName, mode } = useCodeTheme();
  const editorFontSize = editorSettingsStore((s) => s.editorFontSize);
  const wordWrap = editorSettingsStore((s) => s.wordWrap);
  const diffLineHeight = Math.round(editorFontSize * 1.5);

  const codeViewRef = useRef<CodeViewHandle<undefined>>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => createInitialCollapsedKeys(files));
  const [sideBySide, setSideBySide] = useState(false);
  const [changesOnly, setChangesOnly] = useState(true);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const collapsedKeysRef = useRef(collapsedKeys);
  collapsedKeysRef.current = collapsedKeys;

  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;

  const allExpanded = collapsedKeys.size === 0;
  const allCollapsed = collapsedKeys.size === files.length;

  const totals = useMemo(() => getDiffTotals(files), [files]);
  const diffCssVars = useMemo(() => getDiffCssVariablesForPalette(palette, mode), [palette, mode]);

  const options = useMemo(
    () => ({
      theme: themeName,
      diffStyle: (sideBySide ? "split" : "unified") as "split" | "unified",
      expandUnchanged: !changesOnly,
      overflow: (wordWrap ? "wrap" : "scroll") as "wrap" | "scroll",
    }),
    [themeName, sideBySide, changesOnly, wordWrap],
  );

  const searchFiles = useMemo(
    () =>
      files.map((file) => ({
        oldContent: file.oldContent,
        newContent: file.newContent,
        fileId: file.path,
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
    codeViewRef.current?.clearSelectedLines();
  }, []);

  const handleSearchPrevious = useCallback(() => {
    setCurrentMatchIndex((previousMatchIndex) =>
      previousMatchIndex <= 0 ? searchMatches.length - 1 : previousMatchIndex - 1,
    );
  }, [searchMatches.length]);

  const handleSearchNext = useCallback(() => {
    setCurrentMatchIndex((previousMatchIndex) =>
      previousMatchIndex >= searchMatches.length - 1 ? 0 : previousMatchIndex + 1,
    );
  }, [searchMatches.length]);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentMatchIndex(0);
  }, []);

  const initialItems: CodeViewDiffItem[] = useMemo(() => createCodeViewItems(files), [files]);

  useEffect(() => {
    const handle = codeViewRef.current;
    if (!handle) return;

    for (const filePath of files.map((file) => file.path)) {
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
    setCollapsedKeys((previousCollapsedKeys) => {
      const nextCollapsedKeys = new Set(previousCollapsedKeys);
      if (nextCollapsedKeys.has(filePath)) {
        nextCollapsedKeys.delete(filePath);
      } else {
        nextCollapsedKeys.add(filePath);
      }
      return nextCollapsedKeys;
    });
  }, []);

  const handleFoldAll = useCallback(() => {
    setCollapsedKeys(new Set(files.map((file) => file.path)));
  }, [files]);

  const handleUnfoldAll = useCallback(() => {
    setCollapsedKeys(new Set());
  }, []);

  const handleToggleChangesOnly = useCallback(() => {
    setChangesOnly((previousValue) => !previousValue);
  }, []);

  const fileMetaByPath = useMemo(() => createFileMetaByPath(files), [files]);

  const renderCustomHeader = useCallback(
    (item: CustomHeaderItem) => {
      const filePath = item.id;
      const meta = fileMetaByPath.get(filePath);
      const fileName = item.fileDiff?.name ?? item.file?.name ?? filePath;

      return (
        <MultiFileDiffViewerHeader
          filePath={filePath}
          fileName={fileName}
          changeKind={meta?.changeKind}
          additions={meta?.additions ?? 0}
          deletions={meta?.deletions ?? 0}
          isCollapsed={collapsedKeysRef.current.has(filePath)}
          onToggle={handleToggleFile}
          onOpenFile={onOpenFileRef.current}
        />
      );
    },
    [fileMetaByPath, handleToggleFile],
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
      <MultiFileDiffViewerToolbar
        fileCount={files.length}
        totalAdditions={totals.additions}
        totalDeletions={totals.deletions}
        allExpanded={allExpanded}
        allCollapsed={allCollapsed}
        changesOnly={changesOnly}
        sideBySide={sideBySide}
        wrapLines={wordWrap}
        onFoldAll={handleFoldAll}
        onUnfoldAll={handleUnfoldAll}
        onToggleChangesOnly={handleToggleChangesOnly}
        onToggleSideBySide={() => setSideBySide((previousValue) => !previousValue)}
        onToggleWrapLines={() => editorSettingsStore.getState().setWordWrap(!wordWrap)}
        onToggleSearch={() => setSearchActive((previousValue) => !previousValue)}
      />

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
                "--diffs-font-family": MONO_FONT_FAMILY,
                "--diffs-font-size": `${editorFontSize}px`,
                "--diffs-line-height": `${diffLineHeight}px`,
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
