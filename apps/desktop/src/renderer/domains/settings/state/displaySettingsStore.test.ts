// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { DISPLAY_SETTINGS_STORE_STORAGE_KEY, displaySettingsStore } from "./displaySettingsStore";

describe("displaySettingsStore", () => {
  afterEach(() => {
    displaySettingsStore.setState({
      themePreference: "system",
      markdownThemePreference: "inherit",
      markdownPreviewFontSize: "medium",
      markdownPreviewWidth: "readable",
      isMarkdownOutlineVisible: false,
      linkTarget: "built-in",
    });
    window.localStorage.clear();
  });

  it("persists theme preference", () => {
    displaySettingsStore.getState().setThemePreference("light");

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain('"themePreference":"light"');
  });

  it("persists markdown theme preference", () => {
    displaySettingsStore.getState().setMarkdownThemePreference("light");

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"markdownThemePreference":"light"',
    );
  });

  it("persists markdown preview font size and preview width", () => {
    displaySettingsStore.getState().setMarkdownPreviewFontSize("large");
    displaySettingsStore.getState().setMarkdownPreviewWidth("full");

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"markdownPreviewFontSize":"large"',
    );
    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain('"markdownPreviewWidth":"full"');
  });

  it("persists markdown outline visibility", () => {
    displaySettingsStore.getState().setIsMarkdownOutlineVisible(true);

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"isMarkdownOutlineVisible":true',
    );
  });

  it("persists link-open target", () => {
    displaySettingsStore.getState().setLinkTarget("external");

    expect(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY)).toContain('"linkTarget":"external"');
  });
});
