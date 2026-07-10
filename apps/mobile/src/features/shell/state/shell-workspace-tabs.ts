import type {
  OpenShellWorkspaceTabInput,
  ShellWorkspaceTab,
  ShellWorkspaceTabDataByKind,
} from "@/features/shell/state/shell.types";

// Workspace-tab helpers own the durable tab shape used by storage and browser state.
export function getShellWorkspaceTabFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

export function buildShellWorkspaceTabDataByInput<T extends OpenShellWorkspaceTabInput>(
  input: T,
): ShellWorkspaceTabDataByKind[T["kind"]] {
  if (input.kind === "diff") {
    return {
      changeKind: input.changeKind,
      isTemporary: Boolean(input.temporary),
      path: input.path,
    } as ShellWorkspaceTabDataByKind[T["kind"]];
  }

  if (input.kind === "file") {
    return {
      isTemporary: Boolean(input.temporary),
      path: input.path,
    } as ShellWorkspaceTabDataByKind[T["kind"]];
  }

  return {
    agentKind: input.agentKind,
    launchCommand: input.launchCommand ?? null,
    paneId: input.paneId,
    sessionId: input.sessionId,
    terminalId: input.terminalId,
    title: input.title?.trim() || "Terminal",
    userRenamed: input.userRenamed,
  } as ShellWorkspaceTabDataByKind[T["kind"]];
}

export function createShellWorkspaceTabFromOpenInput(
  input: OpenShellWorkspaceTabInput,
  workspaceId: string,
  tabId: string,
): ShellWorkspaceTab {
  if (input.kind === "diff") {
    return {
      data: buildShellWorkspaceTabDataByInput(input),
      id: tabId,
      kind: "diff",
      pinned: false,
      title: getShellWorkspaceTabFileName(input.path),
      workspaceId,
    };
  }

  if (input.kind === "file") {
    return {
      data: buildShellWorkspaceTabDataByInput(input),
      id: tabId,
      kind: "file",
      pinned: false,
      title: getShellWorkspaceTabFileName(input.path),
      workspaceId,
    };
  }

  return {
    data: buildShellWorkspaceTabDataByInput(input),
    id: tabId,
    kind: "terminal",
    pinned: false,
    title: input.title?.trim() || "Terminal",
    workspaceId,
  };
}
