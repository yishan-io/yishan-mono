import { Box, CircularProgress, TextField } from "@mui/material";
import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { MdOutlineKeyboardArrowRight } from "react-icons/md";
import { getFileTreeIcon } from "../fileTreeIcons";
import { FILETREE_DRAG_MIME } from "./dataTransfer";
import type { FileTreeGitChangeKind, VisibleRow } from "./types";

const ROW_HEIGHT = 28;
const INDENT_SIZE = 2;

export { ROW_HEIGHT, INDENT_SIZE };

function getGitChangeIndicatorMeta(kind: FileTreeGitChangeKind): { textColor: string } {
  if (kind === "added") {
    return { textColor: "success.main" };
  }

  if (kind === "renamed") {
    return { textColor: "info.main" };
  }

  return { textColor: "warning.main" };
}

export type FlatTreeRowProps = {
  row: VisibleRow;
  isSelected: boolean;
  isEditing: boolean;
  editingName: string;
  editingInputRef: React.RefObject<HTMLInputElement | null>;
  gitChangeKind: FileTreeGitChangeKind | undefined;
  hasDescendantGitChange: boolean;
  isIgnored: boolean;
  isExpanded: boolean;
  /** When true, shows a loading spinner in place of the expand arrow. */
  isLoading: boolean;
  /** When true, the row is draggable and will emit file path data on drag start. */
  isDraggable: boolean;
  /** Absolute file path used as the drag payload. */
  absolutePath: string;
  /** True when this row is the active drop target during a drag operation. */
  isDropTarget: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onOpen: () => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onEditingNameChange: (value: string) => void;
  onRenameKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onRenameBlur: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>, targetPath: string, targetIsDirectory: boolean) => void;
  onDragEnter: (event: DragEvent<HTMLElement>, targetPath: string, targetIsDirectory: boolean) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
};

/** Renders a single row in the virtualised file tree. */
export function FlatTreeRow({
  row,
  isSelected,
  isEditing,
  editingName,
  editingInputRef,
  gitChangeKind,
  isIgnored,
  isExpanded,
  isLoading,
  isDraggable,
  absolutePath,
  isDropTarget,
  onSelect,
  onToggle,
  onOpen,
  onContextMenu,
  onEditingNameChange,
  onRenameKeyDown,
  onRenameBlur,
  onDragOver,
  onDrop,
  onDragEnter,
  onDragLeave,
  hasDescendantGitChange,
}: FlatTreeRowProps) {
  if (isEditing) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: ROW_HEIGHT,
          pl: row.depth * INDENT_SIZE + 0.5,
          pr: 1,
          borderRadius: 1,
          bgcolor: "action.hover",
        }}
      >
        <Box sx={{ width: 16, flexShrink: 0 }} />
        <Box
          component="img"
          src={getFileTreeIcon(editingName || row.path, row.isDirectory)}
          alt=""
          sx={{ width: 16, height: 16, flexShrink: 0, ml: 0.25 }}
        />
        <TextField
          autoFocus
          inputRef={editingInputRef}
          value={editingName}
          variant="standard"
          autoComplete="off"
          spellCheck={false}
          slotProps={{
            htmlInput: {
              autoCorrect: "off",
              autoCapitalize: "none",
              "data-gramm": "false",
            },
          }}
          onChange={(event) => onEditingNameChange(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            onRenameKeyDown(event);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onBlur={onRenameBlur}
          sx={{
            minWidth: 100,
            ml: 0.75,
            "& .MuiInputBase-input": {
              py: 0,
              typography: "body2",
            },
          }}
        />
      </Box>
    );
  }

  const icon = getFileTreeIcon(row.path, row.isDirectory, isExpanded);
  const indicatorMeta = gitChangeKind
    ? getGitChangeIndicatorMeta(gitChangeKind)
    : hasDescendantGitChange
      ? { textColor: "warning.main" as const }
      : null;

  return (
    <Box
      data-path={row.path}
      data-testid={`tree-row-${row.path}`}
      draggable={isDraggable}
      onDragStart={
        isDraggable
          ? (event: DragEvent<HTMLElement>) => {
              event.dataTransfer.effectAllowed = "copyMove";
              event.dataTransfer.setData(
                FILETREE_DRAG_MIME,
                JSON.stringify([{ path: absolutePath, isDirectory: row.isDirectory }]),
              );
              event.dataTransfer.setData("text/plain", absolutePath);
            }
          : undefined
      }
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
        if (row.isDirectory) {
          onToggle();
        }
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragEnter={(event) => onDragEnter(event, row.path, row.isDirectory)}
      onDragLeave={onDragLeave}
      onDrop={(event) => onDrop(event, row.path, row.isDirectory)}
      sx={{
        display: "flex",
        alignItems: "center",
        height: ROW_HEIGHT,
        pl: row.depth * INDENT_SIZE + 0.5,
        pr: 1,
        borderRadius: 1,
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        bgcolor: isDropTarget ? "action.focus" : isSelected ? "action.selected" : "transparent",
        outline: isDropTarget ? "1.5px dashed" : "none",
        outlineColor: isDropTarget ? "primary.main" : undefined,
        outlineOffset: isDropTarget ? "-1.5px" : undefined,
        "&:hover": {
          bgcolor: isDropTarget ? "action.focus" : isSelected ? "action.selected" : "action.hover",
        },
      }}
    >
      {row.isDirectory ? (
        <Box
          sx={{
            width: 16,
            height: ROW_HEIGHT,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: !isLoading && isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            color: "text.secondary",
            "& svg": { display: "block" },
          }}
        >
          {isLoading ? <CircularProgress size={12} color="inherit" /> : <MdOutlineKeyboardArrowRight size={16} />}
        </Box>
      ) : (
        <Box sx={{ width: 16, flexShrink: 0 }} />
      )}
      <Box component="img" src={icon} alt="" sx={{ width: 16, height: 16, flexShrink: 0, ml: 0.25 }} />
      <Box
        component="span"
        data-ignored={isIgnored ? "true" : "false"}
        data-git-change-kind={gitChangeKind ?? "none"}
        sx={{
          ml: 0.75,
          typography: "body2",
          color: isIgnored ? "text.disabled" : (indicatorMeta?.textColor ?? "text.primary"),
          fontWeight: indicatorMeta ? 500 : 400,
          whiteSpace: "nowrap",
        }}
      >
        {row.name}
      </Box>
    </Box>
  );
}
