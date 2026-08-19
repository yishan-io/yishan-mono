import { MenuItem, TextField } from "@mui/material";
import type { WorkspaceProjectRecord } from "@renderer/domains/project";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import { isFolderWorkspace } from "@renderer/domains/workspace";
import { HiCubeTransparent, HiOutlineCube } from "react-icons/hi2";
import { LuFolder } from "react-icons/lu";

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
  if (isFolderWorkspace(workspace)) {
    return <LuFolder size={size} />;
  }

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
    <MenuItem disableGutters sx={{ px: 1, py: 0.5, cursor: "default" }}>
      <TextField
        autoFocus
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
