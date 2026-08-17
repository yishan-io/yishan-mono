import { describe, expect, it } from "vitest";
import { createLeaf } from "../model/split-pane";
import type { SplitPaneStateSlice } from "../model/split-pane/types";
import { selectActivePane, selectLayoutByWorkspaceId, selectPane, selectPaneForTab } from "./workbenchSelectors";

/**
 * Selectors are pure functions from State to values; tests feed State
 * directly and assert the derived output (desktop-renderer-refactor-rules.md).
 */

const layoutState = {
  layoutByWorkspaceId: {
    "workspace-1": {
      root: createLeaf("pane-1", ["tab-1"], "tab-1"),
      activePaneId: "pane-1",
    },
  } satisfies Record<string, SplitPaneStateSlice>,
} as never;

describe("workbenchSelectors — pure State read functions (Phase 18 correction)", () => {
  it("layout selectors derive panes from State", () => {
    expect(selectLayoutByWorkspaceId(layoutState, "workspace-1")?.activePaneId).toBe("pane-1");
    expect(selectActivePane(layoutState, "workspace-1")?.id).toBe("pane-1");
    expect(selectPane(layoutState, "workspace-1", "pane-1")?.tabIds).toEqual(["tab-1"]);
    expect(selectPaneForTab(layoutState, "workspace-1", "tab-1")?.id).toBe("pane-1");
    expect(selectPaneForTab(layoutState, "workspace-1", "missing")).toBeNull();
  });

  it("returns null when the workspace has no layout", () => {
    expect(selectActivePane({ layoutByWorkspaceId: {} }, "workspace-2")).toBeNull();
    expect(selectPane({ layoutByWorkspaceId: {} }, "workspace-2", "pane-1")).toBeNull();
    expect(selectPaneForTab({ layoutByWorkspaceId: {} }, "workspace-2", "tab-1")).toBeNull();
  });
});
