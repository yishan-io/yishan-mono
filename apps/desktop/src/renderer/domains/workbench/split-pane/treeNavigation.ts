import type { PaneBranch, PaneLeaf, SplitPaneNode } from "./types";

// ─── Tree Navigation Helpers ──────────────────────────────────────────────────

/** Creates a leaf node with given tab ids. */
export function createLeaf(id: string, tabIds: string[], selectedTabId?: string): PaneLeaf {
  return {
    kind: "leaf",
    id,
    tabIds,
    selectedTabId: selectedTabId ?? tabIds[0] ?? "",
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

/** Deep-replaces a node by id in the tree. Returns a new tree (immutable). */
export function replaceNode(root: SplitPaneNode, targetId: string, replacement: SplitPaneNode): SplitPaneNode {
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

/** Finds the parent branch of a node by id. Returns null if root. */
export function findParent(root: SplitPaneNode, targetId: string): PaneBranch | null {
  if (root.kind === "leaf") {
    return null;
  }
  if (root.first.id === targetId || root.second.id === targetId) {
    return root;
  }
  return findParent(root.first, targetId) ?? findParent(root.second, targetId);
}

/** Returns the sibling node of a child within a branch. */
export function getSibling(parent: PaneBranch, childId: string): SplitPaneNode | null {
  if (parent.first.id === childId) return parent.second;
  if (parent.second.id === childId) return parent.first;
  return null;
}

/**
 * Finds the leaf id of the pane opposite to `paneId` at the root level.
 *
 * If root is a single leaf, returns null (no split exists).
 * If root is a branch:
 *   - If `paneId` is in the first subtree, returns a leaf from the second subtree.
 *   - If `paneId` is in the second subtree, returns a leaf from the first subtree.
 *
 * This ensures the user never gets a nested sub-split — only the root-level toggle.
 */
export function findOppositePaneId(root: SplitPaneNode, paneId: string): string | null {
  if (root.kind === "leaf") {
    return null;
  }

  const isInFirst = isPaneInSubtree(root.first, paneId);
  if (isInFirst) {
    const leaf = root.second.kind === "leaf" ? root.second : collectLeaves(root.second)[0];
    return leaf?.id ?? null;
  }

  const isInSecond = isPaneInSubtree(root.second, paneId);
  if (isInSecond) {
    const leaf = root.first.kind === "leaf" ? root.first : collectLeaves(root.first)[0];
    return leaf?.id ?? null;
  }

  return null;
}

/** Returns true when `paneId` is reachable from the given subtree. */
export function isPaneInSubtree(node: SplitPaneNode, paneId: string): boolean {
  if (node.id === paneId) return true;
  if (node.kind === "leaf") return false;
  return isPaneInSubtree(node.first, paneId) || isPaneInSubtree(node.second, paneId);
}
