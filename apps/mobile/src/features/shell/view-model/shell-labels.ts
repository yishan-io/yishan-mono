import type { Workspace, WorkspaceTerminalSession } from "@/features/workspaces/workspaces.types";
import type { ShellPaneTab, TerminalMap, TerminalStatus } from "../state/shell.types";

function lastPathSegment(path: string | null) {
  if (!path) {
    return null;
  }

  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

export function workspaceDisplayName(
  workspace: Workspace,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (workspace.kind === "primary") {
    return t("shell.workspacePrimary");
  }

  return workspace.branch ?? lastPathSegment(workspace.localPath) ?? t("shell.workspaceWorktree");
}

export function workspaceSidebarLabel(
  workspace: Workspace,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return workspaceDisplayName(workspace, t);
}

export function getTerminalStatusLabel(
  status: TerminalStatus | undefined,
  sessionStatus: WorkspaceTerminalSession["status"] | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (status === "initializing") {
    return t("shell.terminalStatusInitializing");
  }

  if (status === "running") {
    return t("shell.terminalStatusRunning");
  }

  if (status === "waiting_input") {
    return t("shell.terminalStatusWaitingInput");
  }

  if (status === "error") {
    return t("shell.terminalStatusError");
  }

  if (sessionStatus === "exited") {
    return t("shell.terminalStatusExited");
  }

  return t("shell.terminalStatusIdle");
}

export function formatTerminalDisplayLabel(label: string) {
  return label;
}

export function getShellPaneTabLabel(
  tab: ShellPaneTab,
  terminalsById: TerminalMap,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (tab.kind === "terminal") {
    const terminal = terminalsById[tab.terminalId];
    return formatTerminalDisplayLabel(terminal?.label ?? t("shell.terminal"));
  }

  const parts = tab.path.split("/");
  return parts[parts.length - 1] || tab.path;
}

export function getShellPaneTabTypeLabel(
  tab: ShellPaneTab,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (tab.kind === "terminal") {
    return t("shell.terminal");
  }

  if (tab.kind === "file") {
    return t("shell.file");
  }

  const changeKindLabel =
    tab.changeKind === "added"
      ? t("shell.diffChangeAdded")
      : tab.changeKind === "deleted"
        ? t("shell.diffChangeDeleted")
        : tab.changeKind === "renamed"
          ? t("shell.diffChangeRenamed")
          : tab.changeKind === "untracked"
            ? t("shell.diffChangeUntracked")
            : t("shell.diffChangeModified");

  return `${t("shell.changes")} ${changeKindLabel}`;
}
