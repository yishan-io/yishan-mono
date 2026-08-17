import { afterEach, describe, expect, it } from "vitest";
import { createLeaf } from "../model/split-pane";
import type { SplitPaneStateSlice } from "../model/split-pane/types";
import type { WorkspaceTab } from "../model/types";
import { layoutStore } from "./layoutStore";
import { splitPaneStore } from "./splitPaneStore";
import { tabStore } from "./tabStore";
import {
  selectActivePane,
  selectIsLeftPaneManuallyHidden,
  selectLayout,
  selectPane,
  selectPaneForTab,
  selectTabById,
  selectTabs,
} from "./workbenchSelectors";

const initialTabState = tabStore.getState();
const initialSplitPaneState = splitPaneStore.getState();
const initialLayoutState = layoutStore.getState();

const tabFixture = { id: "tab-1", workspaceId: "workspace-1", title: "T", pinned: false };
const layoutFixture: SplitPaneStateSlice = {
  root: createLeaf("pane-1", ["tab-1"], "tab-1"),
  activePaneId: "pane-1",
};

afterEach(() => {
  tabStore.setState(initialTabState, true);
  splitPaneStore.setState(initialSplitPaneState, true);
  layoutStore.setState(initialLayoutState, true);
});

describe("workbenchSelectors — Workbench state public read surface (Phase 17)", () => {
  it("selectTabs reads the tab list", () => {
    const tabs: WorkspaceTab[] = [{ ...tabFixture, kind: "file", data: { path: "/tmp/a.txt", content: "", savedContent: "", isDirty: false, isTemporary: false } }];
    tabStore.setState({ tabs });

    expect(selectTabs()).toEqual(tabs);
  });

  it("selectTabById reads one tab", () => {
    tabStore.setState({ tabs: [{ ...tabFixture, kind: "file", data: { path: "/tmp/a.txt", content: "", savedContent: "", isDirty: false, isTemporary: false } }] });

    expect(selectTabById("tab-1")?.id).toBe("tab-1");
    expect(selectTabById("missing")).toBeUndefined();
  });

  it("selectIsLeftPaneManuallyHidden reads the layout visibility state", () => {
    layoutStore.setState({ isLeftPaneManuallyHidden: true });

    expect(selectIsLeftPaneManuallyHidden()).toBe(true);
  });

  it("reads pane layout, panes, and tab placement", () => {
    splitPaneStore.setState({ layoutByWorkspaceId: { "workspace-1": layoutFixture } });

    expect(selectLayout("workspace-1")).toEqual(layoutFixture);
    expect(selectActivePane("workspace-1")?.id).toBe("pane-1");
    expect(selectPane("workspace-1", "pane-1")?.tabIds).toEqual(["tab-1"]);
    expect(selectPaneForTab("workspace-1", "tab-1")?.id).toBe("pane-1");
  });
});
