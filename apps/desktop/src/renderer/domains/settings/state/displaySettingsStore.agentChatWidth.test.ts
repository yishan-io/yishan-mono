// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { DISPLAY_SETTINGS_STORE_STORAGE_KEY, displaySettingsStore } from "./displaySettingsStore";

describe("displaySettingsStore agent chat width preference", () => {
  afterEach(() => {
    displaySettingsStore.setState({ agentChatWidth: "fixed" });
    window.localStorage.clear();
  });

  it("defaults to and persists the fixed width preference", () => {
    expect(displaySettingsStore.getState().agentChatWidth).toBe("fixed");

    displaySettingsStore.getState().setAgentChatWidth("full");

    const persistedState = JSON.parse(window.localStorage.getItem(DISPLAY_SETTINGS_STORE_STORAGE_KEY) ?? "{}").state;

    expect(persistedState).toMatchObject({
      themePreference: "system",
      markdownThemePreference: "inherit",
      markdownPreviewFontSize: "medium",
      markdownPreviewWidth: "readable",
      isMarkdownOutlineVisible: false,
      linkTarget: "built-in",
      agentChatWidth: "full",
    });
  });
});
