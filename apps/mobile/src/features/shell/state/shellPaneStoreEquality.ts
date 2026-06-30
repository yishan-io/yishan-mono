import type {
  ShellWorkspaceTab,
  ShellWorkspaceTabState,
  SplitPaneNode,
  WorkspacePaneLayoutState,
  WorkspacePaneStoreState,
} from "@/features/shell/state/shell.types";

// Pure equality helpers for pane-store persistence and hydration guards.
function workspaceTabsEqual(left: ShellWorkspaceTab, right: ShellWorkspaceTab) {
  if (
    left.id !== right.id ||
    left.workspaceId !== right.workspaceId ||
    left.title !== right.title ||
    left.pinned !== right.pinned ||
    left.kind !== right.kind
  ) {
    return false;
  }

  switch (left.kind) {
    case "terminal":
      return (
        right.kind === "terminal" &&
        left.data.agentKind === right.data.agentKind &&
        left.data.launchCommand === right.data.launchCommand &&
        left.data.paneId === right.data.paneId &&
        left.data.sessionId === right.data.sessionId &&
        left.data.terminalId === right.data.terminalId &&
        left.data.title === right.data.title &&
        left.data.userRenamed === right.data.userRenamed
      );
    case "file":
      return (
        right.kind === "file" && left.data.path === right.data.path && left.data.isTemporary === right.data.isTemporary
      );
    case "diff":
      return (
        right.kind === "diff" &&
        left.data.path === right.data.path &&
        left.data.changeKind === right.data.changeKind &&
        left.data.isTemporary === right.data.isTemporary
      );
  }
}

function splitPaneNodesEqual(left: SplitPaneNode, right: SplitPaneNode): boolean {
  if (left.kind !== right.kind || left.id !== right.id) {
    return false;
  }

  if (left.kind === "leaf" || right.kind === "leaf") {
    return (
      left.kind === "leaf" &&
      right.kind === "leaf" &&
      left.selectedTabId === right.selectedTabId &&
      left.tabIds.length === right.tabIds.length &&
      left.tabIds.every((tabId, index) => tabId === right.tabIds[index])
    );
  }

  return (
    left.direction === right.direction &&
    left.ratio === right.ratio &&
    splitPaneNodesEqual(left.first, right.first) &&
    splitPaneNodesEqual(left.second, right.second)
  );
}

export function workspaceTabStatesEqual(left: ShellWorkspaceTabState, right: ShellWorkspaceTabState) {
  if (
    left.workspaceId !== right.workspaceId ||
    left.selectedTabId !== right.selectedTabId ||
    left.tabs.length !== right.tabs.length
  ) {
    return false;
  }

  return left.tabs.every((tab, index) => {
    const other = right.tabs[index];
    return !!other && workspaceTabsEqual(tab, other);
  });
}

export function workspacePaneLayoutsEqual(left: WorkspacePaneLayoutState, right: WorkspacePaneLayoutState) {
  return left.activePaneId === right.activePaneId && splitPaneNodesEqual(left.root, right.root);
}

export function workspacePaneStoreStatesEqual(left: WorkspacePaneStoreState, right: WorkspacePaneStoreState) {
  return (
    workspaceTabStatesEqual(left.tabState, right.tabState) &&
    workspacePaneLayoutsEqual(left.layoutState, right.layoutState)
  );
}
