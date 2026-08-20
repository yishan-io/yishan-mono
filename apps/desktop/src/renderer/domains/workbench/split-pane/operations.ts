import type { PaneBranch, PaneLeaf, SplitDirection, SplitPaneNode, SplitPaneStateSlice } from "./types";
import { collectLeaves, createLeaf, findLeaf, findLeafByTabId, findParent, getSibling, replaceNode } from "./treeNavigation";

// ─── State Operations ──────────────────────────────────────────────────────────

/**
 * Splits one pane by moving a tab to a new pane in the given direction.
 * The tab is removed from its source pane and placed in a new sibling pane.
 */
export function splitPaneWithTab(
  state: SplitPaneStateSlice,
  input: {
    tabId: string;
    targetPaneId: string;
    direction: SplitDirection;
    /** Whether the new pane should be placed first (left/top) or second (right/bottom). */
    placement: "first" | "second";
    /** External pane id (desktop8 Phase 30: allocated by the caller, not the Model). */
    newPaneId: string;
    /** External branch id (desktop8 Phase 30: allocated by the caller, not the Model). */
    newBranchId: string;
  },
): SplitPaneStateSlice | null {
  const { tabId, targetPaneId, direction, placement, newPaneId, newBranchId } = input;

  // Find the source leaf containing the tab
  const sourceLeaf = findLeafByTabId(state.root, tabId);
  if (!sourceLeaf) {
    return null;
  }

  // Find the target pane where the drop happened
  const targetLeaf = findLeaf(state.root, targetPaneId);
  if (!targetLeaf) {
    return null;
  }

  // Remove tab from its source pane
  let nextRoot = state.root;
  if (sourceLeaf.id === targetLeaf.id) {
    // Splitting within the same pane - only valid if there's more than 1 tab
    if (sourceLeaf.tabIds.length <= 1) {
      return null;
    }
    const removedIndex = sourceLeaf.tabIds.indexOf(tabId);
    const remainingTabIds = sourceLeaf.tabIds.filter((id) => id !== tabId);
    const updatedSource: PaneLeaf = {
      ...sourceLeaf,
      tabIds: remainingTabIds,
      selectedTabId:
        sourceLeaf.selectedTabId === tabId
          ? (remainingTabIds[Math.min(removedIndex, remainingTabIds.length - 1)] ?? "")
          : sourceLeaf.selectedTabId,
    };

    const newLeaf = createLeaf(newPaneId, [tabId], tabId);
    const branch: PaneBranch = {
      kind: "branch",
      id: newBranchId,
      direction,
      ratio: 0.5,
      first: placement === "first" ? newLeaf : updatedSource,
      second: placement === "first" ? updatedSource : newLeaf,
    };

    nextRoot = replaceNode(state.root, targetLeaf.id, branch);
  } else {
    // Tab is moving from one pane to a different target pane
    // First, remove the tab from its source pane
    const remainingTabIds = sourceLeaf.tabIds.filter((id) => id !== tabId);
    if (remainingTabIds.length === 0) {
      // Source pane becomes empty - collapse it out of the tree
      const parent = findParent(nextRoot, sourceLeaf.id);
      if (parent) {
        const sibling = getSibling(parent, sourceLeaf.id);
        if (sibling) {
          nextRoot = replaceNode(nextRoot, parent.id, sibling);
        }
      }
    } else {
      const updatedSource: PaneLeaf = {
        ...sourceLeaf,
        tabIds: remainingTabIds,
        selectedTabId: sourceLeaf.selectedTabId === tabId ? (remainingTabIds[0] ?? "") : sourceLeaf.selectedTabId,
      };
      nextRoot = replaceNode(nextRoot, sourceLeaf.id, updatedSource);
    }

    // Now split the target pane
    const currentTarget = findLeaf(nextRoot, targetPaneId);
    if (!currentTarget) {
      // Target may have been removed if it was the source's sibling
      return null;
    }

    const newLeaf = createLeaf(newPaneId, [tabId], tabId);
    const branch: PaneBranch = {
      kind: "branch",
      id: newBranchId,
      direction,
      ratio: 0.5,
      first: placement === "first" ? newLeaf : currentTarget,
      second: placement === "first" ? currentTarget : newLeaf,
    };

    nextRoot = replaceNode(nextRoot, targetPaneId, branch);
  }

  return {
    root: nextRoot,
    activePaneId: newPaneId,
  };
}

/**
 * Moves a tab to an existing pane (e.g., drop onto center of another pane).
 */
export function moveTabToPane(
  state: SplitPaneStateSlice,
  input: {
    tabId: string;
    targetPaneId: string;
  },
): SplitPaneStateSlice | null {
  const { tabId, targetPaneId } = input;

  const sourceLeaf = findLeafByTabId(state.root, tabId);
  if (!sourceLeaf) {
    return null;
  }

  // Already in the target pane
  if (sourceLeaf.id === targetPaneId) {
    return null;
  }

  const targetLeaf = findLeaf(state.root, targetPaneId);
  if (!targetLeaf) {
    return null;
  }

  let nextRoot = state.root;

  // Remove tab from source
  const remainingTabIds = sourceLeaf.tabIds.filter((id) => id !== tabId);
  if (remainingTabIds.length === 0) {
    // Collapse empty source pane
    const parent = findParent(nextRoot, sourceLeaf.id);
    if (parent) {
      const sibling = getSibling(parent, sourceLeaf.id);
      if (sibling) {
        nextRoot = replaceNode(nextRoot, parent.id, sibling);
      }
    }
  } else {
    const updatedSource: PaneLeaf = {
      ...sourceLeaf,
      tabIds: remainingTabIds,
      selectedTabId: sourceLeaf.selectedTabId === tabId ? (remainingTabIds[0] ?? "") : sourceLeaf.selectedTabId,
    };
    nextRoot = replaceNode(nextRoot, sourceLeaf.id, updatedSource);
  }

  // Add tab to target
  const currentTarget = findLeaf(nextRoot, targetPaneId);
  if (!currentTarget) {
    return null;
  }

  const updatedTarget: PaneLeaf = {
    ...currentTarget,
    tabIds: [...currentTarget.tabIds, tabId],
    selectedTabId: tabId,
  };
  nextRoot = replaceNode(nextRoot, targetPaneId, updatedTarget);

  return {
    root: nextRoot,
    activePaneId: targetPaneId,
  };
}

/**
 * Adds a new tab to the specified pane (or the active pane if not specified).
 */
export function addTabToPane(state: SplitPaneStateSlice, tabId: string, paneId?: string): SplitPaneStateSlice | null {
  const targetPaneId = paneId ?? state.activePaneId;
  const leaf = findLeaf(state.root, targetPaneId);
  if (!leaf) {
    return null;
  }

  const updatedLeaf: PaneLeaf = {
    ...leaf,
    tabIds: [...leaf.tabIds, tabId],
    selectedTabId: tabId,
  };

  return {
    root: replaceNode(state.root, targetPaneId, updatedLeaf),
    activePaneId: targetPaneId,
  };
}

/**
 * Removes a tab from its pane. If the pane becomes empty, collapse it.
 */
export function removeTabFromPane(state: SplitPaneStateSlice, tabId: string): SplitPaneStateSlice | null {
  const leaf = findLeafByTabId(state.root, tabId);
  if (!leaf) {
    return null;
  }

  const remainingTabIds = leaf.tabIds.filter((id) => id !== tabId);

  if (remainingTabIds.length === 0) {
    // Pane is now empty - collapse it
    if (state.root.id === leaf.id) {
      // It's the only pane (root) - keep it empty
      const updatedLeaf: PaneLeaf = { ...leaf, tabIds: [], selectedTabId: "" };
      return {
        root: updatedLeaf,
        activePaneId: leaf.id,
      };
    }

    const parent = findParent(state.root, leaf.id);
    if (!parent) {
      return null;
    }

    const sibling = getSibling(parent, leaf.id);
    if (!sibling) {
      return null;
    }

    const nextRoot = replaceNode(state.root, parent.id, sibling);
    // If active pane was the collapsed one, move to sibling
    const leaves = collectLeaves(nextRoot);
    const nextActivePaneId = state.activePaneId === leaf.id ? (leaves[0]?.id ?? "") : state.activePaneId;

    return {
      root: nextRoot,
      activePaneId: nextActivePaneId,
    };
  }

  // Pane still has tabs - just update selection
  const updatedLeaf: PaneLeaf = {
    ...leaf,
    tabIds: remainingTabIds,
    selectedTabId:
      leaf.selectedTabId === tabId
        ? (remainingTabIds[Math.min(leaf.tabIds.indexOf(tabId), remainingTabIds.length - 1)] ?? "")
        : leaf.selectedTabId,
  };

  return {
    root: replaceNode(state.root, leaf.id, updatedLeaf),
    activePaneId: state.activePaneId,
  };
}

/**
 * Sets the selected tab within a pane.
 */
export function selectTabInPane(state: SplitPaneStateSlice, paneId: string, tabId: string): SplitPaneStateSlice | null {
  const leaf = findLeaf(state.root, paneId);
  if (!leaf || !leaf.tabIds.includes(tabId)) {
    return null;
  }

  if (leaf.selectedTabId === tabId && state.activePaneId === paneId) {
    return null;
  }

  const updatedLeaf: PaneLeaf = { ...leaf, selectedTabId: tabId };
  return {
    root: replaceNode(state.root, paneId, updatedLeaf),
    activePaneId: paneId,
  };
}

/**
 * Sets the active pane focus.
 */
export function setActivePaneState(state: SplitPaneStateSlice, paneId: string): SplitPaneStateSlice | null {
  if (state.activePaneId === paneId) {
    return null;
  }
  const leaf = findLeaf(state.root, paneId);
  if (!leaf) {
    return null;
  }
  return { ...state, activePaneId: paneId };
}

/**
 * Updates the split ratio for a branch node.
 */
export function setSplitRatio(state: SplitPaneStateSlice, branchId: string, ratio: number): SplitPaneStateSlice | null {
  const clamped = Math.max(0.1, Math.min(0.9, ratio));

  function updateBranch(node: SplitPaneNode): SplitPaneNode | null {
    if (node.kind === "leaf") {
      return null;
    }
    if (node.id === branchId) {
      if (node.ratio === clamped) return null;
      return { ...node, ratio: clamped };
    }
    const updatedFirst = updateBranch(node.first);
    if (updatedFirst) {
      return { ...node, first: updatedFirst };
    }
    const updatedSecond = updateBranch(node.second);
    if (updatedSecond) {
      return { ...node, second: updatedSecond };
    }
    return null;
  }

  const nextRoot = updateBranch(state.root);
  if (!nextRoot) {
    return null;
  }

  return { root: nextRoot, activePaneId: state.activePaneId };
}

/**
 * Reorders a tab within its pane (drag reorder within same pane).
 */
export function reorderTabInPane(
  state: SplitPaneStateSlice,
  paneId: string,
  draggedTabId: string,
  targetTabId: string,
  position: "before" | "after",
): SplitPaneStateSlice | null {
  if (draggedTabId === targetTabId) {
    return null;
  }

  const leaf = findLeaf(state.root, paneId);
  if (!leaf) {
    return null;
  }

  if (!leaf.tabIds.includes(draggedTabId) || !leaf.tabIds.includes(targetTabId)) {
    return null;
  }

  const withoutDragged = leaf.tabIds.filter((id) => id !== draggedTabId);
  const targetIndex = withoutDragged.indexOf(targetTabId);
  if (targetIndex < 0) {
    return null;
  }

  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  const reordered = [...withoutDragged];
  reordered.splice(insertAt, 0, draggedTabId);

  const updatedLeaf: PaneLeaf = { ...leaf, tabIds: reordered, selectedTabId: draggedTabId };
  return {
    root: replaceNode(state.root, paneId, updatedLeaf),
    activePaneId: paneId,
  };
}
