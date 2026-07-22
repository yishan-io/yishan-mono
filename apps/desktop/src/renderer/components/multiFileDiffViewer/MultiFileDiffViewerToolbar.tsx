import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import {
  LuChevronsDownUp,
  LuChevronsUpDown,
  LuDiff,
  LuFileText,
  LuSearch,
  LuStretchHorizontal,
  LuStretchVertical,
  LuWrapText,
} from "react-icons/lu";

type MultiFileDiffViewerToolbarProps = {
  fileCount: number;
  totalAdditions: number;
  totalDeletions: number;
  allExpanded: boolean;
  allCollapsed: boolean;
  changesOnly: boolean;
  sideBySide: boolean;
  wrapLines: boolean;
  onFoldAll: () => void;
  onUnfoldAll: () => void;
  onToggleChangesOnly: () => void;
  onToggleSideBySide: () => void;
  onToggleWrapLines: () => void;
  onToggleSearch: () => void;
};

export function MultiFileDiffViewerToolbar({
  fileCount,
  totalAdditions,
  totalDeletions,
  allExpanded,
  allCollapsed,
  changesOnly,
  sideBySide,
  wrapLines,
  onFoldAll,
  onUnfoldAll,
  onToggleChangesOnly,
  onToggleSideBySide,
  onToggleWrapLines,
  onToggleSearch,
}: MultiFileDiffViewerToolbarProps) {
  return (
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
        {fileCount} file{fileCount !== 1 ? "s" : ""} changed
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
          <IconButton aria-label="Fold all files" onClick={onFoldAll} disabled={allCollapsed} sx={{ ml: 0.25 }}>
            <LuChevronsDownUp size={14} />
          </IconButton>
        </Box>
      </Tooltip>

      <Tooltip title={allCollapsed ? "All files collapsed" : "Unfold all files"}>
        <Box component="span">
          <IconButton aria-label="Unfold all files" onClick={onUnfoldAll} disabled={allExpanded} sx={{ ml: 0.25 }}>
            <LuChevronsUpDown size={14} />
          </IconButton>
        </Box>
      </Tooltip>

      <Tooltip title={changesOnly ? "Show entire files" : "Show changes only"}>
        <IconButton aria-label="Toggle changes-only view" onClick={onToggleChangesOnly} sx={{ ml: 0.25 }}>
          {changesOnly ? <LuFileText size={14} /> : <LuDiff size={14} />}
        </IconButton>
      </Tooltip>

      <Tooltip title={sideBySide ? "Switch to inline view" : "Switch to side-by-side view"}>
        <IconButton aria-label="Toggle side-by-side view" onClick={onToggleSideBySide} sx={{ ml: 0.25 }}>
          {sideBySide ? <LuStretchVertical size={14} /> : <LuStretchHorizontal size={14} />}
        </IconButton>
      </Tooltip>

      <Tooltip title={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}>
        <IconButton aria-label="Toggle line wrapping" onClick={onToggleWrapLines} sx={{ ml: 0.25 }}>
          <LuWrapText size={14} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Find in diff (Ctrl+F)">
        <IconButton aria-label="Toggle diff search" onClick={onToggleSearch} sx={{ ml: 0.25 }}>
          <LuSearch size={14} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
