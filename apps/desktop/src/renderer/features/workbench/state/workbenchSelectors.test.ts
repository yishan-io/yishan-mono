import { describe, expect, it } from "vitest";
import { createLeaf } from "../model/split-pane";
import type { SplitPaneStateSlice } from "../model/split-pane/types";
import type { WorkspaceTab } from "../model/types";
import {
  selectActivePane,
  selectIsLeftPaneManuallyHidden,
  selectLayoutByWorkspaceId,
  selectPane,
  selectPaneForTab,
  selectSelectedTabId,
  selectTabById,
  selectTabs,
} from "./workbenchSelectors";

/**
 * Selectors are pure functions from State to values; tests feed State
 * directly and assert the derived output (desktop-renderer-refactor-rules.md).
 */

const tabState = {
  tabs: [{ id: "tab-1", workspaceId: "workspace-1", title: "T", pinned: false }] as unknown as WorkspaceTab[],
  selectedTabId: "tab-1",
} as never;

const layoutState = {
  layoutByWorkspaceId: {
    "workspace-1": {
      root: createLeaf("pane-1", ["tab-1"], "tab-1"),
      activePaneId: "pane-1",
    },
  } satisfies Record<string, SplitPaneStateSlice>,
} as never;

describe("workbenchSelectors — pure State read functions (Phase 18 correction)", () => {
  it("selectTabs reads the tab list from State", () => {
    expect(selectTabs(tabState).map((tab) => tab.id)).toEqual(["tab-1"]);
  });

  it("selectTabById is curried and returns one tab", () => {
    expect(selectTabById("tab-1")(tabState)?.id).toBe("tab-1");
    expect(selectTabById("missing")(tabState)).toBeUndefined();
  });

  it("selectSelectedTabId reads the selection from State", () => {
    expect(selectSelectedTabId(tabState)).toBe("tab-1");
  });

  it("selectIsLeftPaneManuallyHidden reads the flag from State", () => {
    expect(selectIsLeftPaneManuallyHidden({ isLeftPaneManuallyHidden: true })).toBe(true);
  });

  it("layout selectors derive panes from State", () => {
    expect(selectLayoutByWorkspaceId("workspace-1")(layoutState)?.activePaneId).toBe("pane-1");
    expect(selectActivePane("workspace-1")(layoutState)?.id).toBe("pane-1");
    expect(selectPane("workspace-1", "pane-1")(layoutState)?.tabIds).toEqual(["tab-1"]);
    expect(selectPaneForTab("workspace-1", "tab-1")(layoutState)?.id).toBe("pane-1");
    expect(selectPaneForTab("workspace-1", "missing")(layoutState)).toBeNull();
  });
});
