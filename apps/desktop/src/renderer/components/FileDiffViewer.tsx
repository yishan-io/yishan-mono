import { Box, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { parseDiffFromFile } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useCallback, useMemo, useState } from "react";
import { LuDiff, LuExternalLink, LuFileText, LuStretchHorizontal, LuStretchVertical } from "react-icons/lu";
import { isBinaryPath } from "../helpers/binaryExtensions";

type FileDiffViewerProps = {
  filePath: string;
  oldContent: string;
  newContent: string;
  onOpenFile?: (filePath: string) => void;
};

export function FileDiffViewer({ filePath, oldContent, newContent, onOpenFile }: FileDiffViewerProps) {
  const theme = useTheme();
  const [sideBySide, setSideBySide] = useState(false);
  const [changesOnly, setChangesOnly] = useState(true);

  const handleToggleChangesOnly = useCallback(() => {
    setChangesOnly((prev) => !prev);
  }, []);

  const fileDiff = useMemo(
    () => parseDiffFromFile({ name: filePath, contents: oldContent }, { name: filePath, contents: newContent }),
    [filePath, oldContent, newContent],
  );

  const diffTheme = theme.palette.mode === "dark" ? "pierre-dark" : "pierre-light";

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
        {onOpenFile && (
          <Tooltip title="Open file">
            <IconButton size="small" onClick={() => onOpenFile(filePath)} sx={{ ml: 0.5 }}>
              <LuExternalLink size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <FileDiff
          fileDiff={fileDiff}
          style={
            {
              height: "100%",
              overflow: "auto",
              "--diffs-font-family": '"JetBrains Mono", "SF Mono", Menlo, monospace',
              "--diffs-font-size": "13px",
              "--diffs-line-height": "20px",
            } as React.CSSProperties
          }
          options={{
            theme: diffTheme,
            diffStyle: sideBySide ? "split" : "unified",
            expandUnchanged: !changesOnly,
            disableFileHeader: false,
          }}
        />
      </Box>
    </Box>
  );
}
