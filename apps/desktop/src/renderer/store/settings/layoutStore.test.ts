// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LEFT_WIDTH, DEFAULT_RIGHT_WIDTH, LAYOUT_STORE_STORAGE_KEY, layoutStore } from "./layoutStore";

describe("layoutStore", () => {
  afterEach(() => {
    layoutStore.setState({
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      themePreference: "system",
    });
    window.localStorage.clear();
  });

  it("hydrates one valid persisted theme preference", () => {
    window.localStorage.setItem(
      LAYOUT_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          leftWidth: DEFAULT_LEFT_WIDTH,
          rightWidth: DEFAULT_RIGHT_WIDTH,
          themePreference: "dark",
        },
        version: 0,
      }),
    );

    void layoutStore.persist.rehydrate();

    expect(layoutStore.getState().themePreference).toBe("dark");
  });

  it("rehydrates persisted theme preference as stored", () => {
    window.localStorage.setItem(
      LAYOUT_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          leftWidth: DEFAULT_LEFT_WIDTH,
          rightWidth: DEFAULT_RIGHT_WIDTH,
          themePreference: "something-else",
        },
        version: 0,
      }),
    );

    void layoutStore.persist.rehydrate();

    expect(layoutStore.getState().themePreference).toBe("something-else");
  });

  it("persists left and right pane widths", () => {
    layoutStore.getState().setLeftPaneWidth(360);
    layoutStore.getState().setRightPaneWidth(440);

    void layoutStore.persist.rehydrate();

    expect(layoutStore.getState().leftWidth).toBe(360);
    expect(layoutStore.getState().rightWidth).toBe(440);
  });

  it("starts with right pane hidden by default", () => {
    expect(layoutStore.getState().isRightPaneManuallyHidden).toBe(true);
  });

  it("persists theme preference", () => {
    layoutStore.getState().setThemePreference("light");

    expect(window.localStorage.getItem(LAYOUT_STORE_STORAGE_KEY)).toContain('"themePreference":"light"');
  });
});
