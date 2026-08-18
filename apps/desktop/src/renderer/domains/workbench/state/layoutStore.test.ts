// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LEFT_WIDTH, DEFAULT_RIGHT_WIDTH, LAYOUT_STORE_STORAGE_KEY, layoutStore } from "./layoutStore";

describe("layoutStore", () => {
  afterEach(() => {
    layoutStore.setState({
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      isLeftPaneManuallyHidden: false,
    });
    window.localStorage.clear();
  });

  it("persists left and right pane widths", () => {
    layoutStore.getState().setLeftPaneWidth(360);
    layoutStore.getState().setRightPaneWidth(440);

    void layoutStore.persist.rehydrate();

    expect(layoutStore.getState().leftWidth).toBe(360);
    expect(layoutStore.getState().rightWidth).toBe(440);
  });

  it("persists left pane manual visibility", () => {
    layoutStore.getState().setIsLeftPaneManuallyHidden(true);

    expect(window.localStorage.getItem(LAYOUT_STORE_STORAGE_KEY)).toContain('"isLeftPaneManuallyHidden":true');
  });
});
