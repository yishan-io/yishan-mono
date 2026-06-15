import { MenuItem, TextField } from "@mui/material";
import { HiCubeTransparent, HiOutlineCube } from "react-icons/hi2";
import type { WorkspaceItem, WorkspaceProjectRecord } from "../../store/types";

/** Resolves the workspace displayed as local in the left pane for a project. */
export function resolvePrimaryWorkspaceId(project: WorkspaceProjectRecord | undefined, workspaces: WorkspaceItem[]) {
  const preferredProjectPath =
    project?.localPath?.trim() || project?.path?.trim() || project?.worktreePath?.trim() || "";
  if (!project || !preferredProjectPath) {
    return undefined;
  }

  return workspaces.find(
    (workspace) =>
      workspace.repoId === project.id &&
      workspace.kind !== "local" &&
      workspace.worktreePath?.trim() === preferredProjectPath,
  )?.id;
}

/** Renders the same workspace kind icon used by left-pane workspace rows. */
export function renderWorkspaceKindIcon(
  workspace: WorkspaceItem | undefined,
  isPrimaryWorkspace: boolean,
  size: number,
) {
  if (workspace?.kind === "local" || isPrimaryWorkspace) {
    return <HiOutlineCube size={size} />;
  }

  return <HiCubeTransparent size={size} />;
}

type MenuSearchFieldProps = {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

/** Renders a compact search TextField used inside a Menu header row. */
export function MenuSearchField({ placeholder, value, onChange }: MenuSearchFieldProps) {
  return (
    <MenuItem disableRipple disableTouchRipple disableGutters sx={{ px: 1, py: 0.5, cursor: "default" }}>
      <TextField
        autoFocus
        size="small"
        fullWidth
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{ htmlInput: { "aria-label": placeholder } }}
        sx={{
          "& .MuiInputBase-root": { minHeight: 28 },
          "& .MuiInputBase-input": { py: 0.5, fontSize: 13 },
        }}
      />
    </MenuItem>
  );
}
