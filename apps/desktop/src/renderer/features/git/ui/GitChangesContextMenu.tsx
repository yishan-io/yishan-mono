import { Divider, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import { LuCopy, LuCornerUpLeft, LuMinus, LuPlus } from "react-icons/lu";
import type { ProjectGitChangeItem, ProjectGitChangesSection } from "./ProjectGitChangesList.types";

type GitChangesContextMenuState = {
  file: ProjectGitChangeItem;
  sectionId: ProjectGitChangesSection["id"];
  top: number;
  left: number;
};

type GitChangesContextMenuProps = {
  menuState: GitChangesContextMenuState | null;
  readOnly: boolean;
  onClose: () => void;
  onTrackFile?: (file: ProjectGitChangeItem, sectionId: string) => void;
  onRevertFile?: (file: ProjectGitChangeItem) => void;
  onCopyFilePath?: (file: ProjectGitChangeItem) => void;
  onCopyRelativeFilePath?: (file: ProjectGitChangeItem) => void;
};

/** Renders the right-click context menu for a git changes file row. */
export function GitChangesContextMenu({
  menuState,
  readOnly,
  onClose,
  onTrackFile,
  onRevertFile,
  onCopyFilePath,
  onCopyRelativeFilePath,
}: GitChangesContextMenuProps) {
  const isVisible = Boolean(menuState);
  const isStaged = menuState?.sectionId === "staged";

  return (
    <Menu
      open={isVisible}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        menuState
          ? {
              top: menuState.top,
              left: menuState.left,
            }
          : undefined
      }
    >
      {!readOnly && !isStaged ? (
        <MenuItem
          onClick={() => {
            if (menuState) {
              onRevertFile?.(menuState.file);
            }
            onClose();
          }}
        >
          <ListItemIcon>
            <LuCornerUpLeft size={14} />
          </ListItemIcon>
          <ListItemText>Discard</ListItemText>
        </MenuItem>
      ) : null}
      {!readOnly && isStaged ? (
        <MenuItem
          onClick={() => {
            if (menuState) {
              onTrackFile?.(menuState.file, "staged");
            }
            onClose();
          }}
        >
          <ListItemIcon>
            <LuMinus size={14} />
          </ListItemIcon>
          <ListItemText>Unstage</ListItemText>
        </MenuItem>
      ) : !readOnly ? (
        <MenuItem
          onClick={() => {
            if (menuState) {
              onTrackFile?.(menuState.file, menuState.sectionId);
            }
            onClose();
          }}
        >
          <ListItemIcon>
            <LuPlus size={14} />
          </ListItemIcon>
          <ListItemText>Stage</ListItemText>
        </MenuItem>
      ) : null}
      {onCopyFilePath || onCopyRelativeFilePath ? <Divider component="li" /> : null}
      <MenuItem
        onClick={() => {
          if (menuState) {
            onCopyFilePath?.(menuState.file);
          }
          onClose();
        }}
      >
        <ListItemIcon>
          <LuCopy size={14} />
        </ListItemIcon>
        <ListItemText>Copy File Path</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          if (menuState) {
            onCopyRelativeFilePath?.(menuState.file);
          }
          onClose();
        }}
      >
        <ListItemIcon>
          <LuCopy size={14} />
        </ListItemIcon>
        <ListItemText>Copy Relative Path</ListItemText>
      </MenuItem>
    </Menu>
  );
}

export type { GitChangesContextMenuState };
