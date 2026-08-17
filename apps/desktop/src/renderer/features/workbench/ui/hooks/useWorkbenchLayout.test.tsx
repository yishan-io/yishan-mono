// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createLeaf } from "../../model/split-pane";
import type { SplitPaneStateSlice } from "../../model/split-pane/types";
import { layoutStore } from "../../state/layoutStore";
import { splitPaneStore } from "../../state/splitPaneStore";
import { useLayout, useLeftPaneWidth, useRightPaneWidth } from "./useWorkbenchLayout";

const initialLayoutState = layoutStore.getState();
const initialSplitPaneState = splitPaneStore.getState();

afterEach(() => {
  layoutStore.setState(initialLayoutState, true);
  splitPaneStore.setState(initialSplitPaneState, true);
});

describe("useWorkbenchLayout — Workbench layout read hooks (Phase 17)", () => {
  it("useRightPaneWidth and useLeftPaneWidth subscribe to pane widths", () => {
    layoutStore.setState({ rightWidth: 400, leftWidth: 200 });

    const right = renderHook(() => useRightPaneWidth());
    const left = renderHook(() => useLeftPaneWidth());

    expect(right.result.current).toBe(400);
    expect(left.result.current).toBe(200);
  });

  it("useLayout subscribes to one workspace split-pane layout", () => {
    const layout: SplitPaneStateSlice = {
      root: createLeaf("pane-1", ["tab-1"], "tab-1"),
      activePaneId: "pane-1",
    };
    splitPaneStore.setState({ layoutByWorkspaceId: { "workspace-1": layout } });

    const { result } = renderHook(() => useLayout("workspace-1"));

    expect(result.current?.activePaneId).toBe("pane-1");
  });
});
