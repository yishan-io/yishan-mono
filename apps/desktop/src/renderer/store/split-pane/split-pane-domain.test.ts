import { describe, expect, it } from "vitest";
import {
  addTabToPane,
  collectLeaves,
  createLeaf,
  findLeaf,
  findLeafByTabId,
  moveTabToPane,
  removeTabFromPane,
  reorderTabInPane,
  selectTabInPane,
  setActivePaneState,
  setSplitRatio,
  splitPaneWithTab,
} from ".";
import type { PaneBranch, SplitPaneStateSlice } from "./types";

function createSinglePaneState(tabIds: string[] = ["tab-1", "tab-2", "tab-3"]): SplitPaneStateSlice {
  return {
    root: createLeaf("pane-root", tabIds, tabIds[0]),
    activePaneId: "pane-root",
  };
}

function createTwoPaneState(): SplitPaneStateSlice {
  const left = createLeaf("pane-left", ["tab-1", "tab-2"], "tab-1");
  const right = createLeaf("pane-right", ["tab-3", "tab-4"], "tab-3");
  return {
    root: {
      kind: "branch",
      id: "branch-root",
      direction: "horizontal",
      ratio: 0.5,
      first: left,
      second: right,
    },
    activePaneId: "pane-left",
  };
}

// ─── findLeaf / findLeafByTabId ────────────────────────────────────────────────

describe("findLeaf", () => {
  it("finds a leaf in a single-pane layout", () => {
    const state = createSinglePaneState();
    const leaf = findLeaf(state.root, "pane-root");
    expect(leaf).toBeTruthy();
    expect(leaf?.id).toBe("pane-root");
  });

  it("finds a leaf in a split layout", () => {
    const state = createTwoPaneState();
    expect(findLeaf(state.root, "pane-left")?.id).toBe("pane-left");
    expect(findLeaf(state.root, "pane-right")?.id).toBe("pane-right");
  });

  it("returns null for non-existent pane", () => {
    const state = createSinglePaneState();
    expect(findLeaf(state.root, "non-existent")).toBeNull();
  });
});

describe("findLeafByTabId", () => {
  it("finds a leaf containing a tab in a single pane", () => {
    const state = createSinglePaneState();
    const leaf = findLeafByTabId(state.root, "tab-2");
    expect(leaf?.id).toBe("pane-root");
  });

  it("finds the correct pane in a split layout", () => {
    const state = createTwoPaneState();
    expect(findLeafByTabId(state.root, "tab-1")?.id).toBe("pane-left");
    expect(findLeafByTabId(state.root, "tab-4")?.id).toBe("pane-right");
  });

  it("returns null for a tab not in any pane", () => {
    const state = createSinglePaneState();
    expect(findLeafByTabId(state.root, "non-existent")).toBeNull();
  });
});

// ─── collectLeaves ─────────────────────────────────────────────────────────────

describe("collectLeaves", () => {
  it("returns single leaf for a single-pane layout", () => {
    const state = createSinglePaneState();
    const leaves = collectLeaves(state.root);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].id).toBe("pane-root");
  });

  it("returns both leaves for a two-pane layout", () => {
    const state = createTwoPaneState();
    const leaves = collectLeaves(state.root);
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.id)).toEqual(["pane-left", "pane-right"]);
  });
});

// ─── splitPaneWithTab ──────────────────────────────────────────────────────────

describe("splitPaneWithTab", () => {
  it("splits a single pane horizontally by moving a tab to a new right pane", () => {
    const state = createSinglePaneState(["tab-1", "tab-2", "tab-3"]);
    const next = splitPaneWithTab(state, {
      tabId: "tab-3",
      targetPaneId: "pane-root",
      direction: "horizontal",
      placement: "second",
      newPaneId: "pane-new",
      newBranchId: "branch-new",
    });

    expect(next).toBeTruthy();
    expect(next!.root.kind).toBe("branch");

    const branch = next!.root as PaneBranch;
    expect(branch.direction).toBe("horizontal");
    expect(branch.ratio).toBe(0.5);

    // First child should be the original pane (without tab-3)
    expect(branch.first.kind).toBe("leaf");
    if (branch.first.kind === "leaf") {
      expect(branch.first.tabIds).toEqual(["tab-1", "tab-2"]);
    }

    // Second child should be the new pane (with tab-3)
    expect(branch.second.kind).toBe("leaf");
    if (branch.second.kind === "leaf") {
      expect(branch.second.id).toBe("pane-new");
      expect(branch.second.tabIds).toEqual(["tab-3"]);
      expect(branch.second.selectedTabId).toBe("tab-3");
    }

    expect(next!.activePaneId).toBe("pane-new");
  });

  it("splits a single pane vertically by placing a tab on top", () => {
    const state = createSinglePaneState(["tab-1", "tab-2"]);
    const next = splitPaneWithTab(state, {
      tabId: "tab-1",
      targetPaneId: "pane-root",
      direction: "vertical",
      placement: "first",
      newPaneId: "pane-top",
      newBranchId: "branch-top",
    });

    expect(next).toBeTruthy();
    const branch = next!.root as PaneBranch;
    expect(branch.direction).toBe("vertical");

    // First = new pane (top) with tab-1
    if (branch.first.kind === "leaf") {
      expect(branch.first.id).toBe("pane-top");
      expect(branch.first.tabIds).toEqual(["tab-1"]);
    }

    // Second = original pane (bottom) with tab-2
    if (branch.second.kind === "leaf") {
      expect(branch.second.tabIds).toEqual(["tab-2"]);
    }
  });

  it("returns null when splitting a single-tab pane (cannot split)", () => {
    const state = createSinglePaneState(["tab-1"]);
    const next = splitPaneWithTab(state, {
      tabId: "tab-1",
      targetPaneId: "pane-root",
      direction: "horizontal",
      placement: "second",
    });
    expect(next).toBeNull();
  });

  it("moves a tab from one pane to create a split in another", () => {
    const state = createTwoPaneState(); // left: [tab-1, tab-2], right: [tab-3, tab-4]
    const next = splitPaneWithTab(state, {
      tabId: "tab-1",
      targetPaneId: "pane-right",
      direction: "horizontal",
      placement: "first",
      newPaneId: "pane-new",
      newBranchId: "branch-new",
    });

    expect(next).toBeTruthy();
    // tab-1 should no longer be in pane-left
    const leftLeaf = findLeafByTabId(next!.root, "tab-1");
    expect(leftLeaf?.id).toBe("pane-new");

    // pane-left should still exist with tab-2
    const originalLeft = findLeaf(next!.root, "pane-left");
    expect(originalLeft?.tabIds).toEqual(["tab-2"]);
  });

  it("collapses source pane when its last tab is moved to another pane's split", () => {
    // Left has only 1 tab, right has 2
    const left = createLeaf("pane-left", ["tab-1"], "tab-1");
    const right = createLeaf("pane-right", ["tab-2", "tab-3"], "tab-2");
    const state: SplitPaneStateSlice = {
      root: {
        kind: "branch",
        id: "branch-root",
        direction: "horizontal",
        ratio: 0.5,
        first: left,
        second: right,
      },
      activePaneId: "pane-left",
    };

    const next = splitPaneWithTab(state, {
      tabId: "tab-1",
      targetPaneId: "pane-right",
      direction: "vertical",
      placement: "second",
      newPaneId: "pane-new",
      newBranchId: "branch-new",
    });

    expect(next).toBeTruthy();
    // pane-left should be collapsed (removed)
    expect(findLeaf(next!.root, "pane-left")).toBeNull();
    // tab-1 should be in the new pane
    expect(findLeafByTabId(next!.root, "tab-1")?.id).toBe("pane-new");
  });
});

// ─── moveTabToPane ─────────────────────────────────────────────────────────────

describe("moveTabToPane", () => {
  it("moves a tab from one pane to another", () => {
    const state = createTwoPaneState(); // left: [tab-1, tab-2], right: [tab-3, tab-4]
    const next = moveTabToPane(state, { tabId: "tab-1", targetPaneId: "pane-right" });

    expect(next).toBeTruthy();
    const left = findLeaf(next!.root, "pane-left");
    const right = findLeaf(next!.root, "pane-right");
    expect(left?.tabIds).toEqual(["tab-2"]);
    expect(right?.tabIds).toEqual(["tab-3", "tab-4", "tab-1"]);
    expect(right?.selectedTabId).toBe("tab-1");
  });

  it("returns null when moving to the same pane", () => {
    const state = createTwoPaneState();
    const next = moveTabToPane(state, { tabId: "tab-1", targetPaneId: "pane-left" });
    expect(next).toBeNull();
  });

  it("collapses source pane when its last tab is moved", () => {
    const left = createLeaf("pane-left", ["tab-1"], "tab-1");
    const right = createLeaf("pane-right", ["tab-2"], "tab-2");
    const state: SplitPaneStateSlice = {
      root: {
        kind: "branch",
        id: "branch-root",
        direction: "horizontal",
        ratio: 0.5,
        first: left,
        second: right,
      },
      activePaneId: "pane-left",
    };

    const next = moveTabToPane(state, { tabId: "tab-1", targetPaneId: "pane-right" });
    expect(next).toBeTruthy();
    // Left pane should be collapsed, root should be the right pane
    expect(findLeaf(next!.root, "pane-left")).toBeNull();
    const rightLeaf = findLeaf(next!.root, "pane-right");
    expect(rightLeaf?.tabIds).toEqual(["tab-2", "tab-1"]);
  });
});

// ─── addTabToPane ──────────────────────────────────────────────────────────────

describe("addTabToPane", () => {
  it("adds a tab to the active pane by default", () => {
    const state = createSinglePaneState(["tab-1"]);
    const next = addTabToPane(state, "tab-new");
    expect(next).toBeTruthy();
    if (next!.root.kind === "leaf") {
      expect(next!.root.tabIds).toEqual(["tab-1", "tab-new"]);
      expect(next!.root.selectedTabId).toBe("tab-new");
    }
  });

  it("adds a tab to a specific pane", () => {
    const state = createTwoPaneState();
    const next = addTabToPane(state, "tab-new", "pane-right");
    expect(next).toBeTruthy();
    const right = findLeaf(next!.root, "pane-right");
    expect(right?.tabIds).toEqual(["tab-3", "tab-4", "tab-new"]);
  });

  it("returns null for a non-existent pane", () => {
    const state = createSinglePaneState();
    const next = addTabToPane(state, "tab-new", "non-existent");
    expect(next).toBeNull();
  });
});

// ─── removeTabFromPane ─────────────────────────────────────────────────────────

describe("removeTabFromPane", () => {
  it("removes a tab and selects the next one", () => {
    const state = createSinglePaneState(["tab-1", "tab-2", "tab-3"]);
    // Select tab-2 first
    const withSelected: SplitPaneStateSlice = {
      ...state,
      root: { ...state.root, kind: "leaf", selectedTabId: "tab-2" } as any,
    };
    const next = removeTabFromPane(withSelected, "tab-2");
    expect(next).toBeTruthy();
    if (next!.root.kind === "leaf") {
      expect(next!.root.tabIds).toEqual(["tab-1", "tab-3"]);
      // Should select the tab at the same index (tab-3 at index 1)
      expect(next!.root.selectedTabId).toBe("tab-3");
    }
  });

  it("collapses an empty pane in a split layout", () => {
    const state = createTwoPaneState();
    // Remove both tabs from pane-left
    let next = removeTabFromPane(state, "tab-1");
    expect(next).toBeTruthy();
    next = removeTabFromPane(next!, "tab-2");
    expect(next).toBeTruthy();
    // pane-left should be collapsed
    expect(findLeaf(next!.root, "pane-left")).toBeNull();
  });

  it("keeps an empty root pane (does not collapse)", () => {
    const state = createSinglePaneState(["tab-1"]);
    const next = removeTabFromPane(state, "tab-1");
    expect(next).toBeTruthy();
    expect(next!.root.kind).toBe("leaf");
    if (next!.root.kind === "leaf") {
      expect(next!.root.tabIds).toEqual([]);
      expect(next!.root.selectedTabId).toBe("");
    }
  });

  it("returns null for a tab not in any pane", () => {
    const state = createSinglePaneState();
    const next = removeTabFromPane(state, "non-existent");
    expect(next).toBeNull();
  });
});

// ─── selectTabInPane ───────────────────────────────────────────────────────────

describe("selectTabInPane", () => {
  it("selects a tab and activates the pane", () => {
    const state = createTwoPaneState();
    const next = selectTabInPane(state, "pane-right", "tab-4");
    expect(next).toBeTruthy();
    expect(next!.activePaneId).toBe("pane-right");
    const right = findLeaf(next!.root, "pane-right");
    expect(right?.selectedTabId).toBe("tab-4");
  });

  it("returns null when tab is already selected and pane is active", () => {
    const state = createSinglePaneState(["tab-1"]);
    const next = selectTabInPane(state, "pane-root", "tab-1");
    expect(next).toBeNull();
  });

  it("returns null for non-existent tab", () => {
    const state = createSinglePaneState();
    const next = selectTabInPane(state, "pane-root", "non-existent");
    expect(next).toBeNull();
  });
});

// ─── setActivePaneState ────────────────────────────────────────────────────────

describe("setActivePaneState", () => {
  it("changes the active pane", () => {
    const state = createTwoPaneState();
    const next = setActivePaneState(state, "pane-right");
    expect(next).toBeTruthy();
    expect(next!.activePaneId).toBe("pane-right");
  });

  it("returns null when already active", () => {
    const state = createTwoPaneState();
    const next = setActivePaneState(state, "pane-left");
    expect(next).toBeNull();
  });

  it("returns null for non-existent pane", () => {
    const state = createTwoPaneState();
    const next = setActivePaneState(state, "non-existent");
    expect(next).toBeNull();
  });
});

// ─── setSplitRatio ─────────────────────────────────────────────────────────────

describe("setSplitRatio", () => {
  it("updates the split ratio for a branch", () => {
    const state = createTwoPaneState();
    const next = setSplitRatio(state, "branch-root", 0.7);
    expect(next).toBeTruthy();
    const branch = next!.root as PaneBranch;
    expect(branch.ratio).toBe(0.7);
  });

  it("clamps ratio to 0.1..0.9 range", () => {
    const state = createTwoPaneState();
    const tooSmall = setSplitRatio(state, "branch-root", 0.01);
    expect((tooSmall!.root as PaneBranch).ratio).toBe(0.1);

    const tooLarge = setSplitRatio(state, "branch-root", 0.99);
    expect((tooLarge!.root as PaneBranch).ratio).toBe(0.9);
  });

  it("returns null for non-existent branch", () => {
    const state = createTwoPaneState();
    const next = setSplitRatio(state, "non-existent", 0.5);
    expect(next).toBeNull();
  });
});

// ─── reorderTabInPane ──────────────────────────────────────────────────────────

describe("reorderTabInPane", () => {
  it("reorders tabs within a pane", () => {
    const state = createSinglePaneState(["tab-1", "tab-2", "tab-3"]);
    const next = reorderTabInPane(state, "pane-root", "tab-3", "tab-1", "before");
    expect(next).toBeTruthy();
    if (next!.root.kind === "leaf") {
      expect(next!.root.tabIds).toEqual(["tab-3", "tab-1", "tab-2"]);
      expect(next!.root.selectedTabId).toBe("tab-3");
    }
  });

  it("moves tab after a target", () => {
    const state = createSinglePaneState(["tab-1", "tab-2", "tab-3"]);
    const next = reorderTabInPane(state, "pane-root", "tab-1", "tab-3", "after");
    expect(next).toBeTruthy();
    if (next!.root.kind === "leaf") {
      expect(next!.root.tabIds).toEqual(["tab-2", "tab-3", "tab-1"]);
    }
  });

  it("returns null when dragging onto itself", () => {
    const state = createSinglePaneState();
    const next = reorderTabInPane(state, "pane-root", "tab-1", "tab-1", "before");
    expect(next).toBeNull();
  });

  it("returns null for non-existent pane", () => {
    const state = createSinglePaneState();
    const next = reorderTabInPane(state, "non-existent", "tab-1", "tab-2", "before");
    expect(next).toBeNull();
  });
});
