import { afterEach, describe, expect, it } from "vitest";
import { workspaceSettingsStore } from "./workspaceSettingsStore";
import { selectIsDefaultContextEnabled } from "./settingsSelectors";

const initialWorkspaceSettingsState = workspaceSettingsStore.getState();

afterEach(() => {
  workspaceSettingsStore.setState(initialWorkspaceSettingsState, true);
});

describe("settingsSelectors — Settings state public read surface (Phase 17)", () => {
  it("selectIsDefaultContextEnabled reads the store default", () => {
    expect(selectIsDefaultContextEnabled()).toBe(true);
  });

  it("selectIsDefaultContextEnabled reflects store updates", () => {
    workspaceSettingsStore.setState({ isDefaultContextEnabled: false });

    expect(selectIsDefaultContextEnabled()).toBe(false);
  });
});
