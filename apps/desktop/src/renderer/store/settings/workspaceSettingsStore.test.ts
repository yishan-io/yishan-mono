// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { WORKSPACE_SETTINGS_STORE_STORAGE_KEY, workspaceSettingsStore } from "./workspaceSettingsStore";

describe("workspaceSettingsStore", () => {
  afterEach(() => {
    workspaceSettingsStore.setState({
      isDefaultContextEnabled: true,
      prefixMode: "none",
      customPrefix: "",
    });
    window.localStorage.clear();
  });

  it("defaults context to enabled", () => {
    expect(workspaceSettingsStore.getState().isDefaultContextEnabled).toBe(true);
  });

  it("persists default context toggle updates", () => {
    workspaceSettingsStore.getState().setDefaultContextEnabled(false);

    expect(window.localStorage.getItem(WORKSPACE_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"isDefaultContextEnabled":false',
    );
  });

  it("hydrates a persisted default context preference", () => {
    window.localStorage.setItem(
      WORKSPACE_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          isDefaultContextEnabled: false,
        },
        version: 0,
      }),
    );

    void workspaceSettingsStore.persist.rehydrate();

    expect(workspaceSettingsStore.getState().isDefaultContextEnabled).toBe(false);
  });

  it("falls back to enabled when persisted state is invalid", () => {
    window.localStorage.setItem(
      WORKSPACE_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          isDefaultContextEnabled: "nope",
        },
        version: 0,
      }),
    );

    void workspaceSettingsStore.persist.rehydrate();

    expect(workspaceSettingsStore.getState().isDefaultContextEnabled).toBe(true);
  });

  it("persists branch prefix settings", () => {
    workspaceSettingsStore.getState().setPrefixMode("custom");
    workspaceSettingsStore.getState().setCustomPrefix("team-core");

    expect(window.localStorage.getItem(WORKSPACE_SETTINGS_STORE_STORAGE_KEY)).toContain('"prefixMode":"custom"');
    expect(window.localStorage.getItem(WORKSPACE_SETTINGS_STORE_STORAGE_KEY)).toContain('"customPrefix":"team-core"');
  });

  it("hydrates branch prefix settings from legacy git-branch store", () => {
    window.localStorage.setItem(
      "yishan-git-branch-naming-store",
      JSON.stringify({
        state: {
          prefixMode: "user",
          customPrefix: "legacy",
        },
        version: 0,
      }),
    );

    void workspaceSettingsStore.persist.rehydrate();

    expect(workspaceSettingsStore.getState().prefixMode).toBe("user");
    expect(workspaceSettingsStore.getState().customPrefix).toBe("legacy");
  });
});
