import type { ShellFocusPreview, ShellPaneTab, ShellSelection } from "@/features/shell/state/shell.types";
import type { WorkspaceGitChangeKind } from "@/features/workspaces/workspaces.types";

export type ShellParams = {
  kind?: string;
  orgId?: string;
  projectId?: string;
  workspaceId?: string;
  terminalId?: string;
  tab?: string;
  previewKind?: string;
  filePath?: string;
  changeKind?: string;
};

export type WorkspaceContext = {
  orgId: string;
  projectId: string;
  workspaceId: string;
};

export function toSelection(params: ShellParams): ShellSelection {
  if (params.kind === "workspace" && params.orgId && params.projectId && params.workspaceId) {
    return {
      kind: "workspace",
      orgId: params.orgId,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
    };
  }

  const terminalId = params.terminalId;
  if (params.kind === "terminal" && params.orgId && params.projectId && params.workspaceId && terminalId) {
    return {
      kind: "workspace",
      orgId: params.orgId,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
    };
  }

  return { kind: "home" };
}

export function toWorkspaceContext(selection: ShellSelection): WorkspaceContext | null {
  if (selection.kind === "home") {
    return null;
  }

  return {
    orgId: selection.orgId,
    projectId: selection.projectId,
    workspaceId: selection.workspaceId,
  };
}

export function readRoutePreview(params: ShellParams): ShellFocusPreview {
  if (!params.filePath) {
    return null;
  }

  if (params.previewKind === "diff") {
    return {
      changeKind: readChangeKind(params.changeKind) ?? "modified",
      kind: "diff",
      path: params.filePath,
    };
  }

  return {
    kind: "file",
    path: params.filePath,
  };
}

export function previewFromTab(tab: ShellPaneTab | null): ShellFocusPreview {
  if (!tab || tab.kind === "terminal") {
    return null;
  }

  if (tab.kind === "file") {
    return { kind: "file", path: tab.path };
  }

  return {
    changeKind: tab.changeKind,
    kind: "diff",
    path: tab.path,
  };
}

export function buildSelectionParams(
  selection: Extract<ShellSelection, { kind: "workspace" }>,
  activeTab: ShellPaneTab | null,
  options?: {
    includePreview?: boolean;
  },
) {
  const preview = options?.includePreview === false ? null : previewFromTab(activeTab);

  return {
    ...(preview?.kind === "diff"
      ? { changeKind: preview.changeKind, previewKind: "diff" as const, tab: "changes" as const }
      : {}),
    ...(preview?.kind === "file" ? { previewKind: "file" as const, tab: "files" as const } : {}),
    ...(preview ? { filePath: preview.path } : {}),
    kind: "workspace" as const,
    orgId: selection.orgId,
    projectId: selection.projectId,
    workspaceId: selection.workspaceId,
  };
}

export function routeParamsEqual(current: ShellParams, next: ReturnType<typeof buildSelectionParams>) {
  return (
    (current.kind ?? undefined) === next.kind &&
    (current.orgId ?? undefined) === next.orgId &&
    (current.projectId ?? undefined) === next.projectId &&
    (current.workspaceId ?? undefined) === next.workspaceId &&
    (current.terminalId ?? undefined) === undefined &&
    (current.previewKind ?? undefined) === next.previewKind &&
    (current.filePath ?? undefined) === next.filePath &&
    (current.changeKind ?? undefined) === next.changeKind &&
    (current.tab ?? undefined) === next.tab
  );
}

export function readChangeKind(value: string | undefined): WorkspaceGitChangeKind | null {
  switch (value) {
    case "added":
    case "modified":
    case "deleted":
    case "renamed":
    case "untracked":
      return value;
    default:
      return null;
  }
}
