import type { ShellPaneTab, ShellSelection, TerminalMap } from "../state/shell.types";

type WorkspaceLike = {
  id: string;
};

type ProjectLike<TWorkspace extends WorkspaceLike = WorkspaceLike> = {
  workspaces: TWorkspace[];
};

/**
 * Narrows a shell selection to a workspace-scoped selection when available.
 */
export function readWorkspaceSelection(selection: ShellSelection) {
  if (selection.kind === "home") {
    return null;
  }

  return selection;
}

/**
 * Finds the first available workspace across the current project list.
 */
export function findFallbackWorkspace<TWorkspace extends WorkspaceLike>(
  projects: ProjectLike<TWorkspace>[],
): TWorkspace | null {
  return projects.flatMap((project) => project.workspaces).find(Boolean) ?? null;
}

/**
 * Detects whether the active pane still points at a missing terminal tab.
 */
export function isMissingSelectedTerminalTab(
  activePaneTab: ShellPaneTab | null,
  selectedTerminalId: string,
  terminalsById: TerminalMap,
) {
  if (terminalsById[selectedTerminalId]) {
    return false;
  }

  return activePaneTab?.kind === "terminal" && activePaneTab.terminalId === selectedTerminalId;
}
