import type {
  ShellSelection,
  ShellWorkspaceTabState,
  WorkspacePaneStoreState,
} from "@/features/shell/state/shell.types";
import { createSinglePaneLayoutState } from "./shell-pane-layout-helpers";

export const ALL_NODES_SELECTION = "__all__";

export function createEmptyShellWorkspaceTabState(workspaceId: string): ShellWorkspaceTabState {
  return {
    selectedTabId: "",
    tabs: [],
    workspaceId,
  };
}

export function createEmptyWorkspacePaneStoreState(workspaceId: string): WorkspacePaneStoreState {
  const tabState = createEmptyShellWorkspaceTabState(workspaceId);
  return {
    layoutState: createSinglePaneLayoutState(tabState),
    tabState,
  };
}

export function selectionsEqual(left: ShellSelection, right: ShellSelection) {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case "home":
      return true;
    case "workspace":
      return (
        right.kind === "workspace" &&
        left.orgId === right.orgId &&
        left.projectId === right.projectId &&
        left.workspaceId === right.workspaceId
      );
  }
}
