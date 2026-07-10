import type {
  PaneLeaf,
  ShellPaneTab,
  ShellWorkspaceTab,
  ShellWorkspaceTabState,
  SplitPaneNode,
  WorkspacePaneLayoutState,
  WorkspacePaneStoreState,
} from "@/features/shell/state/shell.types";
import { paneTabFromWorkspaceTab } from "./shell-pane-tab-helpers";
import { workspacePaneStoreStatesEqual } from "./shellPaneStoreEquality";
import { collectLeaves, createLeaf, findLeaf, findLeafByTabId } from "./split-pane/operations";
import { closeShellWorkspaceTabState } from "./workspace-tabs/close";

const DEFAULT_ROOT_PANE_ID = "pane-root";

function resolveActiveLeaf(node: SplitPaneNode, activePaneId: string): PaneLeaf | null {
  return findLeaf(node, activePaneId) ?? (node.kind === "leaf" ? node : null);
}

function replaceLeafNode(root: SplitPaneNode, paneId: string, nextLeaf: PaneLeaf): SplitPaneNode {
  if (root.kind === "leaf") {
    return root.id === paneId ? nextLeaf : root;
  }

  return {
    ...root,
    first: replaceLeafNode(root.first, paneId, nextLeaf),
    second: replaceLeafNode(root.second, paneId, nextLeaf),
  };
}

function normalizeLayoutNode(
  node: SplitPaneNode,
  validTabIds: Set<string>,
  seenTabIds: Set<string>,
): SplitPaneNode | null {
  if (node.kind === "leaf") {
    const nextTabIds = node.tabIds.filter((tabId) => {
      if (!validTabIds.has(tabId) || seenTabIds.has(tabId)) {
        return false;
      }
      seenTabIds.add(tabId);
      return true;
    });

    if (nextTabIds.length === 0) {
      return null;
    }

    return {
      ...node,
      selectedTabId: nextTabIds.includes(node.selectedTabId) ? node.selectedTabId : (nextTabIds[0] ?? ""),
      tabIds: nextTabIds,
    };
  }

  const first = normalizeLayoutNode(node.first, validTabIds, seenTabIds);
  const second = normalizeLayoutNode(node.second, validTabIds, seenTabIds);

  if (first && second) {
    return {
      ...node,
      first,
      second,
    };
  }

  return first ?? second;
}

export function createSinglePaneLayoutState(
  tabState: ShellWorkspaceTabState,
  paneId = DEFAULT_ROOT_PANE_ID,
): WorkspacePaneLayoutState {
  return {
    activePaneId: paneId,
    root: createLeaf(
      paneId,
      tabState.tabs.map((tab) => tab.id),
      tabState.selectedTabId,
    ),
  };
}

export function normalizePaneLayoutState(
  tabState: ShellWorkspaceTabState,
  layoutState?: WorkspacePaneLayoutState | null,
): WorkspacePaneLayoutState {
  const validTabIds = new Set(tabState.tabs.map((tab) => tab.id));
  const normalizedSelectedTabId = validTabIds.has(tabState.selectedTabId)
    ? tabState.selectedTabId
    : (tabState.tabs[0]?.id ?? "");

  if (!layoutState) {
    return createSinglePaneLayoutState({ ...tabState, selectedTabId: normalizedSelectedTabId });
  }

  const seenTabIds = new Set<string>();
  const normalizedRoot = normalizeLayoutNode(layoutState.root, validTabIds, seenTabIds);
  if (!normalizedRoot) {
    return createSinglePaneLayoutState({ ...tabState, selectedTabId: normalizedSelectedTabId });
  }

  const normalizedLeaves = collectLeaves(normalizedRoot);
  const activeLeaf = resolveActiveLeaf(normalizedRoot, layoutState.activePaneId) ?? normalizedLeaves[0] ?? null;
  if (!activeLeaf) {
    return createSinglePaneLayoutState({ ...tabState, selectedTabId: normalizedSelectedTabId });
  }

  const missingTabIds = tabState.tabs.map((tab) => tab.id).filter((tabId) => !seenTabIds.has(tabId));
  const nextActiveTabIds = [...activeLeaf.tabIds, ...missingTabIds];
  const nextSelectedTabId = nextActiveTabIds.includes(normalizedSelectedTabId)
    ? normalizedSelectedTabId
    : nextActiveTabIds.includes(activeLeaf.selectedTabId)
      ? activeLeaf.selectedTabId
      : (nextActiveTabIds[0] ?? "");
  const rootWithMissingTabs = replaceLeafNode(
    normalizedRoot,
    activeLeaf.id,
    createLeaf(activeLeaf.id, nextActiveTabIds, nextSelectedTabId),
  );
  const selectedLeaf =
    (normalizedSelectedTabId ? findLeafByTabId(rootWithMissingTabs, normalizedSelectedTabId) : null) ??
    resolveActiveLeaf(rootWithMissingTabs, activeLeaf.id);

  if (!selectedLeaf) {
    return createSinglePaneLayoutState({ ...tabState, selectedTabId: normalizedSelectedTabId });
  }

  const nextRoot =
    normalizedSelectedTabId && selectedLeaf.selectedTabId !== normalizedSelectedTabId
      ? replaceLeafNode(
          rootWithMissingTabs,
          selectedLeaf.id,
          createLeaf(selectedLeaf.id, selectedLeaf.tabIds, normalizedSelectedTabId),
        )
      : rootWithMissingTabs;

  return {
    activePaneId: selectedLeaf.id,
    root: nextRoot,
  };
}

export function getActivePaneFromWorkspacePaneStoreState(storeState: WorkspacePaneStoreState): PaneLeaf | null {
  const normalizedLayoutState = normalizePaneLayoutState(storeState.tabState, storeState.layoutState);
  return resolveActiveLeaf(normalizedLayoutState.root, normalizedLayoutState.activePaneId);
}

export function getPaneForTabFromWorkspacePaneStoreState(
  storeState: WorkspacePaneStoreState,
  tabId: string,
): PaneLeaf | null {
  const normalizedLayoutState = normalizePaneLayoutState(storeState.tabState, storeState.layoutState);
  return findLeafByTabId(normalizedLayoutState.root, tabId);
}

export function getAllPanesFromWorkspacePaneStoreState(storeState: WorkspacePaneStoreState): PaneLeaf[] {
  const normalizedLayoutState = normalizePaneLayoutState(storeState.tabState, storeState.layoutState);
  return collectLeaves(normalizedLayoutState.root);
}

export function getActivePaneTabIdsFromWorkspacePaneStoreState(storeState: WorkspacePaneStoreState): string[] {
  return getActivePaneFromWorkspacePaneStoreState(storeState)?.tabIds ?? [];
}

export function getActivePaneTabFromWorkspacePaneStoreState(storeState: WorkspacePaneStoreState): ShellPaneTab | null {
  const activeLeaf = getActivePaneFromWorkspacePaneStoreState(storeState);
  if (!activeLeaf?.selectedTabId) {
    return null;
  }

  const activeTab = storeState.tabState.tabs.find((tab) => tab.id === activeLeaf.selectedTabId);
  return activeTab ? paneTabFromWorkspaceTab(activeTab) : null;
}

export function getActivePaneTabsFromWorkspacePaneStoreState(storeState: WorkspacePaneStoreState): ShellPaneTab[] {
  const activeLeaf = getActivePaneFromWorkspacePaneStoreState(storeState);
  const activeTabIds = activeLeaf?.tabIds ?? [];
  return activeTabIds
    .map((tabId) => storeState.tabState.tabs.find((tab) => tab.id === tabId))
    .filter((tab): tab is ShellWorkspaceTab => Boolean(tab))
    .map(paneTabFromWorkspaceTab);
}

export function selectWorkspacePaneStoreTab(
  storeState: WorkspacePaneStoreState,
  tabId: string,
): WorkspacePaneStoreState {
  if (!storeState.tabState.tabs.some((tab) => tab.id === tabId)) {
    return storeState;
  }

  const nextTabState =
    storeState.tabState.selectedTabId === tabId
      ? storeState.tabState
      : { ...storeState.tabState, selectedTabId: tabId };
  const normalizedLayoutState = normalizePaneLayoutState(nextTabState, storeState.layoutState);
  const targetLeaf = findLeafByTabId(normalizedLayoutState.root, tabId);
  if (!targetLeaf) {
    return storeState;
  }

  const nextLayoutState = normalizePaneLayoutState(nextTabState, {
    activePaneId: targetLeaf.id,
    root:
      targetLeaf.selectedTabId === tabId
        ? normalizedLayoutState.root
        : replaceLeafNode(
            normalizedLayoutState.root,
            targetLeaf.id,
            createLeaf(targetLeaf.id, targetLeaf.tabIds, tabId),
          ),
  });

  return workspacePaneStoreStatesEqual(storeState, {
    layoutState: nextLayoutState,
    tabState: nextTabState,
  })
    ? storeState
    : {
        layoutState: nextLayoutState,
        tabState: nextTabState,
      };
}

export function closeWorkspacePaneStoreTab(
  storeState: WorkspacePaneStoreState,
  tabId: string,
): WorkspacePaneStoreState {
  if (!storeState.tabState.tabs.some((tab) => tab.id === tabId)) {
    return storeState;
  }

  const normalizedLayoutState = normalizePaneLayoutState(storeState.tabState, storeState.layoutState);
  const targetLeaf = findLeafByTabId(normalizedLayoutState.root, tabId);
  const currentIndex = targetLeaf?.tabIds.findIndex((leafTabId) => leafTabId === tabId) ?? -1;
  const nextPaneTabIds =
    currentIndex === -1 || !targetLeaf ? [] : targetLeaf.tabIds.filter((leafTabId) => leafTabId !== tabId);
  const nextPaneSelectedTabId =
    currentIndex === -1 || targetLeaf?.selectedTabId !== tabId
      ? (targetLeaf?.selectedTabId ?? "")
      : (nextPaneTabIds[currentIndex] ?? nextPaneTabIds[currentIndex - 1] ?? "");
  const provisionalTabState = {
    ...storeState.tabState,
    selectedTabId: storeState.tabState.selectedTabId === tabId ? "" : storeState.tabState.selectedTabId,
    tabs: storeState.tabState.tabs.filter((tab) => tab.id !== tabId),
  };
  const provisionalLayoutState = normalizePaneLayoutState(
    provisionalTabState,
    targetLeaf
      ? {
          activePaneId: normalizedLayoutState.activePaneId,
          root: replaceLeafNode(
            normalizedLayoutState.root,
            targetLeaf.id,
            createLeaf(targetLeaf.id, nextPaneTabIds, nextPaneSelectedTabId),
          ),
        }
      : normalizedLayoutState,
  );
  const fallbackSelectedTabId =
    getActivePaneFromWorkspacePaneStoreState({
      layoutState: provisionalLayoutState,
      tabState: provisionalTabState,
    })?.selectedTabId ?? closeShellWorkspaceTabState(storeState.tabState, tabId).selectedTabId;
  const nextSelectedTabId =
    storeState.tabState.selectedTabId !== tabId ? provisionalTabState.selectedTabId : fallbackSelectedTabId;
  const nextTabState =
    provisionalTabState.selectedTabId === nextSelectedTabId
      ? provisionalTabState
      : { ...provisionalTabState, selectedTabId: nextSelectedTabId };
  const nextLayoutState = normalizePaneLayoutState(nextTabState, provisionalLayoutState);
  return workspacePaneStoreStatesEqual(storeState, {
    layoutState: nextLayoutState,
    tabState: nextTabState,
  })
    ? storeState
    : {
        layoutState: nextLayoutState,
        tabState: nextTabState,
      };
}
