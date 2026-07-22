import { Box, IconButton, Typography } from "@mui/material";
import { LuChevronDown, LuChevronRight, LuExternalLink } from "react-icons/lu";
import { getFileTreeIcon } from "../fileTreeIcons";
import { getChangeKindLabel } from "./multiFileDiffViewerHelpers";

type MultiFileDiffViewerHeaderProps = {
  filePath: string;
  fileName: string;
  changeKind?: string;
  additions: number;
  deletions: number;
  isCollapsed: boolean;
  onToggle: (path: string) => void;
  onOpenFile?: (path: string) => void;
};

export function MultiFileDiffViewerHeader({
  filePath,
  fileName,
  changeKind,
  additions,
  deletions,
  isCollapsed,
  onToggle,
  onOpenFile,
}: MultiFileDiffViewerHeaderProps) {
  const changeKindLabel = getChangeKindLabel(changeKind);

  return (
    <Box
      onClick={() => onToggle(filePath)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1,
        py: 0.5,
        cursor: "pointer",
        userSelect: "none",
        minHeight: 28,
      }}
    >
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
        {isCollapsed ? <LuChevronRight size={14} /> : <LuChevronDown size={14} />}
      </Box>

      <Box
        component="img"
        src={getFileTreeIcon(fileName, false)}
        alt=""
        sx={{ width: 14, height: 14, flexShrink: 0 }}
      />

      <Typography
        component="span"
        sx={{
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
      </Typography>

      {changeKindLabel && (
        <Typography component="span" sx={{ fontSize: 11, opacity: 0.6, flexShrink: 0 }}>
          {changeKindLabel}
        </Typography>
      )}

      {additions > 0 && (
        <Typography component="span" sx={{ fontSize: 11, color: "var(--diffs-addition-base, #0dbe4e)", flexShrink: 0 }}>
          +{additions}
        </Typography>
      )}
      {deletions > 0 && (
        <Typography component="span" sx={{ fontSize: 11, color: "var(--diffs-deletion-base, #ff2e3f)", flexShrink: 0 }}>
          -{deletions}
        </Typography>
      )}

      {onOpenFile && (
        <IconButton
          title="Open file"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenFile(filePath);
          }}
          sx={{ ml: 0.5, p: 0.25, opacity: 0.5, color: "inherit", flexShrink: 0 }}
        >
          <LuExternalLink size={12} />
        </IconButton>
      )}
    </Box>
  );
}
