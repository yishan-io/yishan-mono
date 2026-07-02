import type { WorkspaceRecord } from "../api/types";
import { getFileName } from "../store/tabs";
import type { WorkspaceItem } from "../store/types";

export const LOCAL_WORKSPACE_DISPLAY_NAME = "local";
const DEFAULT_MANAGED_WORKSPACE_DISPLAY_NAME = "workspace";

/** Resolves stable store/display names for a hydrated API workspace record. */
export function resolveHydratedWorkspaceDisplayMetadata(
  workspace: Pick<WorkspaceRecord, "kind" | "branch" | "localPath">,
): Pick<WorkspaceItem, "name" | "title"> {
  if (workspace.kind === "primary") {
    return {
      name: LOCAL_WORKSPACE_DISPLAY_NAME,
      title: LOCAL_WORKSPACE_DISPLAY_NAME,
    };
  }

  const branchDisplayName = workspace.branch?.trim() || DEFAULT_MANAGED_WORKSPACE_DISPLAY_NAME;
  const pathDisplayName = getFileName(workspace.localPath?.trim() ?? "");

  return {
    name: branchDisplayName,
    title: pathDisplayName || branchDisplayName,
  };
}

/** Resolves store/display names for an optimistic or explicitly named workspace row. */
export function resolveExplicitWorkspaceDisplayMetadata(name: string): Pick<WorkspaceItem, "name" | "title"> {
  const normalizedName = name.trim() || DEFAULT_MANAGED_WORKSPACE_DISPLAY_NAME;
  return {
    name: normalizedName,
    title: normalizedName,
  };
}

/** Resolves the left-pane row label for a workspace item. */
export function resolveWorkspaceListDisplayName(
  workspace: Pick<WorkspaceItem, "id" | "kind" | "title">,
  localDisplayWorkspaceId: string,
): string {
  if (workspace.kind === "local" || localDisplayWorkspaceId === workspace.id) {
    return LOCAL_WORKSPACE_DISPLAY_NAME;
  }

  return workspace.title;
}
