import type {
  ShellFocusPreview,
  ShellPaneTab,
  ShellSelection,
  ShellWorkspaceTab,
} from "@/features/shell/state/shell.types";
import type { WorkspaceContext } from "./shell-route-state";

// Pane-tab helpers translate between durable workspace tabs, focus-pane tabs, and route selections.
export function createTerminalTab(terminalId: string): ShellPaneTab {
  return {
    id: `terminal:${terminalId}`,
    kind: "terminal",
    terminalId,
  };
}

export function createPreviewTab(preview: Exclude<ShellFocusPreview, null>): ShellPaneTab {
  if (preview.kind === "file") {
    return {
      id: `file:${preview.path}`,
      kind: "file",
      path: preview.path,
    };
  }

  return {
    changeKind: preview.changeKind,
    id: `diff:${preview.changeKind}:${preview.path}`,
    kind: "diff",
    path: preview.path,
  };
}

export function paneTabFromWorkspaceTab(tab: ShellWorkspaceTab): ShellPaneTab {
  if (tab.kind === "terminal") {
    return createTerminalTab(tab.data.terminalId);
  }

  if (tab.kind === "file") {
    return {
      id: tab.id,
      kind: "file",
      path: tab.data.path,
    };
  }

  return {
    changeKind: tab.data.changeKind,
    id: tab.id,
    kind: "diff",
    path: tab.data.path,
  };
}

export function routeSelectionFromActiveTab(
  context: WorkspaceContext,
  _activeTab: ShellPaneTab | null,
): Extract<ShellSelection, { kind: "workspace" }> {
  return {
    kind: "workspace",
    orgId: context.orgId,
    projectId: context.projectId,
    workspaceId: context.workspaceId,
  };
}
