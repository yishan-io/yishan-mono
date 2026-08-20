import { createLeaf, findLeaf, findLeafByTabId, replaceNode } from "./treeNavigation";
import type { PaneBranch, SplitDirection, SplitPaneStateSlice } from "./types";

/** Creates a sibling pane containing an unplaced tab without mutating the target pane. */
export function createAdjacentPaneWithTab(
  state: SplitPaneStateSlice,
  input: {
    tabId: string;
    targetPaneId: string;
    direction: SplitDirection;
    placement: "first" | "second";
    /** External pane id (desktop8 Phase 30: allocated by the caller, not the Model). */
    newPaneId: string;
    /** External branch id (desktop8 Phase 30: allocated by the caller, not the Model). */
    newBranchId: string;
  },
): SplitPaneStateSlice | null {
  const targetLeaf = findLeaf(state.root, input.targetPaneId);
  if (!targetLeaf || findLeafByTabId(state.root, input.tabId)) {
    return null;
  }

  const newPaneId = input.newPaneId;
  const newBranchId = input.newBranchId;
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
