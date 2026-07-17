import { Box, ButtonBase, IconButton, Tooltip, Typography } from "@mui/material";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { LuCornerUpLeft, LuMinus, LuPlus } from "react-icons/lu";
import { GitChangeTotals } from "./GitChangeTotals";
import type {
  ProjectGitChangeItem,
  ProjectGitChangeKind,
  ProjectGitChangesSection,
} from "./ProjectGitChangesList.types";

type GitChangesFileRowProps = {
  file: ProjectGitChangeItem;
  section: ProjectGitChangesSection;
  isSelected: boolean;
  readOnly: boolean;
  showContextMenu: boolean;
  showRevertAction: boolean;
  trackVerb: string;
  restoreVerb: string;
  TrackIcon: React.ComponentType<{ size: number }>;
  onFileClick: (event: ReactMouseEvent, file: ProjectGitChangeItem, section: ProjectGitChangesSection) => void;
  onContextMenu?: (event: ReactMouseEvent, file: ProjectGitChangeItem, sectionId: string) => void;
  onRevertFile?: (file: ProjectGitChangeItem) => void;
  onTrackFile?: (file: ProjectGitChangeItem, sectionId: string) => void;
  onDragStart?: (event: ReactDragEvent, file: ProjectGitChangeItem, sectionId: string) => void;
  onDragEnd?: () => void;
};

/** Returns one icon/color pair for one git change kind badge. */
function getChangeColors(kind: ProjectGitChangeKind, sectionId: string) {
  if (sectionId === "untracked") {
    return { icon: "?", color: "info.main" };
  }

  if (kind === "renamed") {
    return { icon: "R", color: "info.main" };
  }

  if (kind === "untracked") {
    return { icon: "?", color: "info.main" };
  }

  if (kind === "added") {
    return { icon: "A", color: "success.main" };
  }

  if (kind === "deleted") {
    return { icon: "D", color: "error.main" };
  }

  return { icon: "M", color: "warning.light" };
}

/** Renders a single file row in a git changes section with indicator badge, name, stats and action buttons. */
export function GitChangesFileRow({
  file,
  section,
  isSelected,
  readOnly,
  showContextMenu,
  showRevertAction,
  trackVerb,
  restoreVerb,
  TrackIcon,
  onFileClick,
  onContextMenu,
  onRevertFile,
  onTrackFile,
  onDragStart,
  onDragEnd,
}: GitChangesFileRowProps) {
  const fileName = file.path.split("/").pop() ?? file.path;
  const indicator = getChangeColors(file.kind, section.id);

  return (
    <Box
      data-testid={`changes-file-${section.id}-${file.path}`}
      onContextMenu={showContextMenu ? (event) => onContextMenu?.(event, file, section.id) : undefined}
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : (event) => onDragStart?.(event, file, section.id)}
      onDragEnd={readOnly ? undefined : onDragEnd}
      sx={{
        minHeight: 30,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        borderRadius: 1,
        bgcolor: isSelected ? "action.selected" : undefined,
        "&:hover": { bgcolor: "action.hover" },
        "&:hover .file-actions, &:focus-within .file-actions": {
          opacity: 1,
          pointerEvents: "auto",
        },
      }}
    >
      <ButtonBase
        disableRipple
        onClick={(event) => onFileClick(event, file, section)}
        sx={{
          minHeight: 30,
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          px: 0.75,
          justifyContent: "flex-start",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
          <Box
            data-testid={`changes-file-indicator-${section.id}-${file.path}`}
            sx={{
              width: 14,
              height: 14,
              border: 1,
              borderColor: indicator.color,
              borderRadius: 0.5,
              color: indicator.color,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              mr: 1,
              flexShrink: 0,
            }}
          >
            {indicator.icon}
          </Box>

          <Typography
            variant="body2"
            data-testid={`changes-file-name-${section.id}-${file.path}`}
            title={file.path}
            sx={{
              flex: 1,
              fontSize: 12,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            {fileName}
          </Typography>

          {file.kind !== "renamed" && (file.additions > 0 || file.deletions > 0) ? (
            <GitChangeTotals
              testId={`changes-file-stats-${section.id}-${file.path}`}
              additions={file.additions}
              deletions={file.deletions}
              hideZeroSides
              sx={{ ml: 1, flexShrink: 0 }}
            />
          ) : null}
        </Box>
      </ButtonBase>

      {readOnly ? null : (
        <Box
          className="file-actions"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            pr: 0.5,
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 0.15s ease",
          }}
        >
          {showRevertAction ? (
            <Tooltip title={`${restoreVerb} file`} arrow placement="top">
              <IconButton size="small" aria-label={`${restoreVerb} ${file.path}`} onClick={() => onRevertFile?.(file)}>
                <LuCornerUpLeft size={12} />
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip title={`${trackVerb} file`} arrow placement="top">
            <IconButton
              size="small"
              aria-label={`${trackVerb} ${file.path}`}
              onClick={() => onTrackFile?.(file, section.id)}
            >
              <TrackIcon size={12} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
