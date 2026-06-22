import {
  closeWorkspacePaneStoreTab,
  getActivePaneTabIdsFromWorkspacePaneStoreState,
  normalizePaneLayoutState,
} from "@/features/shell/state/shell-pane-layout-helpers";
import { createPreviewTab, createTerminalTab } from "@/features/shell/state/shell-pane-tab-helpers";
import {
  createEmptyShellWorkspaceTabState,
  createEmptyWorkspacePaneStoreState,
} from "@/features/shell/state/shell-state-helpers";
import { createShellWorkspaceTabFromOpenInput } from "@/features/shell/state/shell-workspace-tabs";
import type { ShellFocusPreview, TerminalItem, WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import { openShellWorkspaceTabState } from "./workspace-tabs/open";

type TerminalTabBinding = Pick<TerminalItem, "id"> &
  Partial<Pick<TerminalItem, "agentKind" | "label" | "launchCommand" | "session" | "userRenamed">>;

function buildTerminalOpenInput(workspaceId: string, terminal: TerminalTabBinding) {
  return {
    agentKind: terminal.agentKind,
    kind: "terminal" as const,
    launchCommand: terminal.launchCommand ?? null,
    paneId: terminal.session?.paneId,
    reuseExisting: true,
    sessionId: terminal.session?.sessionId,
    terminalId: terminal.id,
    title: terminal.userRenamed ? terminal.label : "Terminal",
    userRenamed: terminal.userRenamed,
    workspaceId,
  };
}

export function upsertWorkspaceTerminalTabStoreState(
  storeState: WorkspacePaneStoreState | null | undefined,
  workspaceId: string,
  terminal: TerminalTabBinding,
  options?: { select?: boolean },
): WorkspacePaneStoreState {
  const currentStoreState = storeState ?? createEmptyWorkspacePaneStoreState(workspaceId);
  const currentTabState = currentStoreState.tabState.workspaceId
    ? currentStoreState.tabState
    : createEmptyShellWorkspaceTabState(workspaceId);
  const nextTabId = createTerminalTab(terminal.id).id;
  const existingTab = currentTabState.tabs.find(
    (tab) => tab.workspaceId === workspaceId && tab.kind === "terminal" && tab.data.terminalId === terminal.id,
  );

  if (!existingTab) {
    const nextTabState = openShellWorkspaceTabState(
      currentTabState,
      buildTerminalOpenInput(workspaceId, terminal),
      nextTabId,
    );
    const selectedTabId =
      options?.select === false && currentTabState.selectedTabId
        ? currentTabState.selectedTabId
        : nextTabState.selectedTabId;
    const resolvedTabState =
      selectedTabId === nextTabState.selectedTabId ? nextTabState : { ...nextTabState, selectedTabId };

    return {
      layoutState: normalizePaneLayoutState(resolvedTabState, currentStoreState.layoutState),
      tabState: resolvedTabState,
    };
  }

  const nextTitle = terminal.userRenamed ? (terminal.label ?? existingTab.title) : existingTab.title;
  const nextTab = createShellWorkspaceTabFromOpenInput(
    buildTerminalOpenInput(workspaceId, terminal),
    workspaceId,
    existingTab.id,
  );
  const resolvedTab = {
    ...nextTab,
    pinned: existingTab.pinned,
    title: nextTitle,
  };
  const nextTabs = currentTabState.tabs.map((tab) => (tab.id === existingTab.id ? resolvedTab : tab));
  const nextSelectedTabId = options?.select === false ? currentTabState.selectedTabId : existingTab.id;
  const nextTabState =
    nextSelectedTabId === currentTabState.selectedTabId &&
    nextTabs.every((tab, index) => tab === currentTabState.tabs[index])
      ? currentTabState
      : {
          ...currentTabState,
          selectedTabId: nextSelectedTabId,
          tabs: nextTabs,
        };

  return {
    layoutState: normalizePaneLayoutState(nextTabState, currentStoreState.layoutState),
    tabState: nextTabState,
  };
}

export function upsertWorkspaceTerminalStoreState(
  storeState: WorkspacePaneStoreState | null | undefined,
  workspaceId: string,
  terminal: TerminalTabBinding,
): WorkspacePaneStoreState {
  return upsertWorkspaceTerminalTabStoreState(storeState, workspaceId, terminal, { select: true });
}

export function upsertWorkspaceTerminalTabsStoreState(
  storeState: WorkspacePaneStoreState | null | undefined,
  workspaceId: string,
  terminals: TerminalTabBinding[],
  options?: { terminalIdsToRemove?: string[] },
): WorkspacePaneStoreState {
  let nextStoreState = storeState ?? createEmptyWorkspacePaneStoreState(workspaceId);
  const preservedSelectedTabId = nextStoreState.tabState.selectedTabId;

  for (const terminal of terminals) {
    nextStoreState = upsertWorkspaceTerminalTabStoreState(nextStoreState, workspaceId, terminal, { select: false });
  }

  for (const terminalId of options?.terminalIdsToRemove ?? []) {
    nextStoreState = closeWorkspacePaneStoreTab(nextStoreState, createTerminalTab(terminalId).id);
  }

  if (
    preservedSelectedTabId &&
    nextStoreState.tabState.selectedTabId !== preservedSelectedTabId &&
    nextStoreState.tabState.tabs.some((tab) => tab.id === preservedSelectedTabId)
  ) {
    const nextTabState = { ...nextStoreState.tabState, selectedTabId: preservedSelectedTabId };
    return {
      layoutState: normalizePaneLayoutState(nextTabState, nextStoreState.layoutState),
      tabState: nextTabState,
    };
  }

  return nextStoreState;
}

export function upsertWorkspacePreviewStoreState(
  storeState: WorkspacePaneStoreState | null | undefined,
  workspaceId: string,
  preview: Exclude<ShellFocusPreview, null>,
  options?: { temporary?: boolean },
): WorkspacePaneStoreState {
  const currentStoreState = storeState ?? createEmptyWorkspacePaneStoreState(workspaceId);
  const activePaneTabIds = getActivePaneTabIdsFromWorkspacePaneStoreState(currentStoreState);
  const nextTabState = openShellWorkspaceTabState(
    currentStoreState.tabState.workspaceId
      ? currentStoreState.tabState
      : createEmptyShellWorkspaceTabState(workspaceId),
    preview.kind === "file"
      ? {
          kind: "file",
          path: preview.path,
          temporary: options?.temporary ?? false,
          workspaceId,
        }
      : {
          changeKind: preview.changeKind,
          kind: "diff",
          path: preview.path,
          temporary: options?.temporary ?? false,
          workspaceId,
        },
    createPreviewTab(preview).id,
    { activePaneTabIds, allowTemporaryReuse: false },
  );

  return {
    layoutState: normalizePaneLayoutState(nextTabState, currentStoreState.layoutState),
    tabState: nextTabState,
  };
}
