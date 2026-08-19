import { createLeaf } from "./operations";
import type { PaneBranch, SplitDirection, SplitPaneStateSlice } from "./types";

/**
 * Splits a single-pane layout into two panes with an empty second pane.
 * Returns null when the layout already has a split. Pane/branch ids are
 * allocated by the caller (desktop8 Phase 30: no ID allocation in Model).
 */
export function splitRootPane(
  state: SplitPaneStateSlice,
  direction: SplitDirection,
  newPaneId: string,
  newBranchId: string,
): SplitPaneStateSlice | null {
  if (state.root.kind !== "leaf") {
    return null;
  }

  const secondPaneId = newPaneId;
  const branchId = newBranchId;
  const newLeaf = createLeaf(secondPaneId, []);
  const branch: PaneBranch = {
    kind: "branch",
    id: branchId,
    direction,
    ratio: 0.5,
    first: state.root,
    second: newLeaf,
  };

  return {
    root: branch,
    activePaneId: secondPaneId,
  };
}
