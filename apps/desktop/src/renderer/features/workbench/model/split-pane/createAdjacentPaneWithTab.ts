import { createLeaf, createPaneId, findLeaf, findLeafByTabId, replaceNode } from "./operations";
import type { PaneBranch, SplitDirection, SplitPaneStateSlice } from "./types";

/** Creates a sibling pane containing an unplaced tab without mutating the target pane. */
export function createAdjacentPaneWithTab(
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
  const targetLeaf = findLeaf(state.root, input.targetPaneId);
  if (!targetLeaf || findLeafByTabId(state.root, input.tabId)) {
    return null;
  }

  const newPaneId = input.newPaneId ?? createPaneId();
  const newBranchId = input.newBranchId ?? createPaneId();
  const newLeaf = createLeaf(newPaneId, [input.tabId], input.tabId);
  const branch: PaneBranch = {
    kind: "branch",
    id: newBranchId,
    direction: input.direction,
    ratio: 0.5,
    first: input.placement === "first" ? newLeaf : targetLeaf,
    second: input.placement === "first" ? targetLeaf : newLeaf,
  };

  return {
    root: replaceNode(state.root, targetLeaf.id, branch),
    activePaneId: newPaneId,
  };
}
