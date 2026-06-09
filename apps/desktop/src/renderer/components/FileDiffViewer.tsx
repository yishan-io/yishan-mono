import { Box, IconButton, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { parseDiffFromFile } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useCallback, useMemo, useState } from "react";
import { LuDiff, LuFileText, LuStretchHorizontal, LuStretchVertical } from "react-icons/lu";
import { isBinaryPath } from "../helpers/binaryExtensions";

type FileDiffViewerProps = {
  filePath: string;
  oldContent: string;
  newContent: string;
};

export function FileDiffViewer({ filePath, oldContent, newContent }: FileDiffViewerProps) {
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
          bgcolor: (muiTheme) =>
            muiTheme.palette.mode === "dark" ? "background.default" : muiTheme.palette.background.paper,
        }}
      >
        <Tooltip title={changesOnly ? "Show entire file" : "Show changes only"}>
          <IconButton size="small" onClick={handleToggleChangesOnly}>
            {changesOnly ? <LuFileText size={14} /> : <LuDiff size={14} />}
          </IconButton>
        </Tooltip>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, ml: 1 }}>
          <IconButton size="small" onClick={() => setSideBySide(false)} disabled={!sideBySide}>
            <LuStretchHorizontal size={14} />
          </IconButton>
          <IconButton size="small" onClick={() => setSideBySide(true)} disabled={sideBySide} sx={{ ml: 0.25 }}>
            <LuStretchVertical size={14} />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <FileDiff
          fileDiff={fileDiff}
          style={{ height: "100%", overflow: "auto" }}
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
