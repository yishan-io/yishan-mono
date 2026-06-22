import { generateId } from "@/helpers/generateId";
import type { PaneBranch, PaneLeaf, SplitDirection, SplitPaneNode, SplitPaneStateSlice } from "./types";

/** Creates a new unique pane id. */
export function createPaneId(): string {
  return generateId("pane");
}

/** Creates a leaf node with given tab ids. */
export function createLeaf(id: string, tabIds: string[], selectedTabId?: string): PaneLeaf {
  return {
    kind: "leaf",
    id,
    selectedTabId: selectedTabId ?? tabIds[0] ?? "",
    tabIds,
  };
}

/** Finds a leaf node by id in the tree. */
export function findLeaf(node: SplitPaneNode, paneId: string): PaneLeaf | null {
  if (node.kind === "leaf") {
    return node.id === paneId ? node : null;
  }
  return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId);
}

/** Finds the leaf that contains a given tab id. */
export function findLeafByTabId(node: SplitPaneNode, tabId: string): PaneLeaf | null {
  if (node.kind === "leaf") {
    return node.tabIds.includes(tabId) ? node : null;
  }
  return findLeafByTabId(node.first, tabId) ?? findLeafByTabId(node.second, tabId);
}

/** Returns all leaf nodes in the tree. */
export function collectLeaves(node: SplitPaneNode): PaneLeaf[] {
  if (node.kind === "leaf") {
    return [node];
  }
  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

function replaceNode(root: SplitPaneNode, targetId: string, replacement: SplitPaneNode): SplitPaneNode {
  if (root.id === targetId) {
    return replacement;
  }
  if (root.kind === "leaf") {
    return root;
  }
  return {
    ...root,
    first: replaceNode(root.first, targetId, replacement),
    second: replaceNode(root.second, targetId, replacement),
  };
}

function findParent(root: SplitPaneNode, targetId: string): PaneBranch | null {
  if (root.kind === "leaf") {
    return null;
  }
  if (root.first.id === targetId || root.second.id === targetId) {
    return root;
  }
  return findParent(root.first, targetId) ?? findParent(root.second, targetId);
}

function getSibling(parent: PaneBranch, childId: string): SplitPaneNode | null {
  if (parent.first.id === childId) return parent.second;
  if (parent.second.id === childId) return parent.first;
  return null;
}

export function splitPaneWithTab(
  state: SplitPaneStateSlice,
  input: {
    tabId: string;
    targetPaneId: string;
    direction: SplitDirection;
    placement: "first" | "second";
    newPaneId?: string;
    newBranchId?: string;
  },
): SplitPaneStateSlice | null {
  const { direction, placement, tabId, targetPaneId } = input;
  const newPaneId = input.newPaneId ?? createPaneId();
  const newBranchId = input.newBranchId ?? createPaneId();
  const sourceLeaf = findLeafByTabId(state.root, tabId);
  if (!sourceLeaf) {
    return null;
  }
  const targetLeaf = findLeaf(state.root, targetPaneId);
  if (!targetLeaf) {
    return null;
  }

  let nextRoot = state.root;
  if (sourceLeaf.id === targetLeaf.id) {
    if (sourceLeaf.tabIds.length <= 1) {
      return null;
    }
    const removedIndex = sourceLeaf.tabIds.indexOf(tabId);
    const remainingTabIds = sourceLeaf.tabIds.filter((id) => id !== tabId);
    const updatedSource: PaneLeaf = {
      ...sourceLeaf,
      selectedTabId:
        sourceLeaf.selectedTabId === tabId
          ? (remainingTabIds[Math.min(removedIndex, remainingTabIds.length - 1)] ?? "")
          : sourceLeaf.selectedTabId,
      tabIds: remainingTabIds,
    };
    const newLeaf = createLeaf(newPaneId, [tabId], tabId);
    const branch: PaneBranch = {
      direction,
      first: placement === "first" ? newLeaf : updatedSource,
      id: newBranchId,
      kind: "branch",
      ratio: 0.5,
      second: placement === "first" ? updatedSource : newLeaf,
    };
    nextRoot = replaceNode(state.root, targetLeaf.id, branch);
  } else {
    const remainingTabIds = sourceLeaf.tabIds.filter((id) => id !== tabId);
    if (remainingTabIds.length === 0) {
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
        selectedTabId: sourceLeaf.selectedTabId === tabId ? (remainingTabIds[0] ?? "") : sourceLeaf.selectedTabId,
        tabIds: remainingTabIds,
      };
      nextRoot = replaceNode(nextRoot, sourceLeaf.id, updatedSource);
    }

    const currentTarget = findLeaf(nextRoot, targetPaneId);
    if (!currentTarget) {
      return null;
    }

    const newLeaf = createLeaf(newPaneId, [tabId], tabId);
    const branch: PaneBranch = {
      direction,
      first: placement === "first" ? newLeaf : currentTarget,
      id: newBranchId,
      kind: "branch",
      ratio: 0.5,
      second: placement === "first" ? currentTarget : newLeaf,
    };
    nextRoot = replaceNode(nextRoot, targetPaneId, branch);
  }

  return {
    activePaneId: newPaneId,
    root: nextRoot,
  };
}

export function moveTabToPane(
  state: SplitPaneStateSlice,
  input: {
    tabId: string;
    targetPaneId: string;
  },
): SplitPaneStateSlice | null {
  const { tabId, targetPaneId } = input;
  const sourceLeaf = findLeafByTabId(state.root, tabId);
  if (!sourceLeaf || sourceLeaf.id === targetPaneId) {
    return null;
  }
  const targetLeaf = findLeaf(state.root, targetPaneId);
  if (!targetLeaf) {
    return null;
  }

  let nextRoot = state.root;
  const remainingTabIds = sourceLeaf.tabIds.filter((id) => id !== tabId);
  if (remainingTabIds.length === 0) {
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
      selectedTabId: sourceLeaf.selectedTabId === tabId ? (remainingTabIds[0] ?? "") : sourceLeaf.selectedTabId,
      tabIds: remainingTabIds,
    };
    nextRoot = replaceNode(nextRoot, sourceLeaf.id, updatedSource);
  }

  const currentTarget = findLeaf(nextRoot, targetPaneId);
  if (!currentTarget) {
    return null;
  }
  const updatedTarget: PaneLeaf = {
    ...currentTarget,
    selectedTabId: tabId,
    tabIds: [...currentTarget.tabIds, tabId],
  };
  nextRoot = replaceNode(nextRoot, targetPaneId, updatedTarget);
  return {
    activePaneId: targetPaneId,
    root: nextRoot,
  };
}

export function addTabToPane(state: SplitPaneStateSlice, tabId: string, paneId?: string): SplitPaneStateSlice | null {
  const targetPaneId = paneId ?? state.activePaneId;
  const leaf = findLeaf(state.root, targetPaneId);
  if (!leaf) {
    return null;
  }
  const updatedLeaf: PaneLeaf = {
    ...leaf,
    selectedTabId: tabId,
    tabIds: [...leaf.tabIds, tabId],
  };
  return {
    activePaneId: targetPaneId,
    root: replaceNode(state.root, targetPaneId, updatedLeaf),
  };
}

export function removeTabFromPane(state: SplitPaneStateSlice, tabId: string): SplitPaneStateSlice | null {
  const leaf = findLeafByTabId(state.root, tabId);
  if (!leaf) {
    return null;
  }
  const remainingTabIds = leaf.tabIds.filter((id) => id !== tabId);

  if (remainingTabIds.length === 0) {
    if (state.root.id === leaf.id) {
      const updatedLeaf: PaneLeaf = { ...leaf, selectedTabId: "", tabIds: [] };
      return {
        activePaneId: leaf.id,
        root: updatedLeaf,
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
    const leaves = collectLeaves(nextRoot);
    const nextActivePaneId = state.activePaneId === leaf.id ? (leaves[0]?.id ?? "") : state.activePaneId;
    return {
      activePaneId: nextActivePaneId,
      root: nextRoot,
    };
  }

  const updatedLeaf: PaneLeaf = {
    ...leaf,
    selectedTabId:
      leaf.selectedTabId === tabId
        ? (remainingTabIds[Math.min(leaf.tabIds.indexOf(tabId), remainingTabIds.length - 1)] ?? "")
        : leaf.selectedTabId,
    tabIds: remainingTabIds,
  };
  return {
    activePaneId: state.activePaneId,
    root: replaceNode(state.root, leaf.id, updatedLeaf),
  };
}

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
    activePaneId: paneId,
    root: replaceNode(state.root, paneId, updatedLeaf),
  };
}

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
  return { activePaneId: state.activePaneId, root: nextRoot };
}

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
  if (!leaf || !leaf.tabIds.includes(draggedTabId) || !leaf.tabIds.includes(targetTabId)) {
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
  return {
    activePaneId: state.activePaneId,
    root: replaceNode(state.root, paneId, { ...leaf, tabIds: reordered }),
  };
}
