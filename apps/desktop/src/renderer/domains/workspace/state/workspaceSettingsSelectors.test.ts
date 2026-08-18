import { afterEach, describe, expect, it } from "vitest";
import { selectIsDefaultContextEnabled } from "./workspaceSettingsSelectors";
import { workspaceSettingsStore } from "./workspaceSettingsStore";

const initialWorkspaceSettingsState = workspaceSettingsStore.getState();

afterEach(() => {
  workspaceSettingsStore.setState(initialWorkspaceSettingsState, true);
});

describe("workspaceSettingsSelectors — Workspace settings read surface (desktop7 Phase 23)", () => {
  it("reads the default context-enabled preference", () => {
    workspaceSettingsStore.setState({ isDefaultContextEnabled: false } as never);

    expect(selectIsDefaultContextEnabled()).toBe(false);

    workspaceSettingsStore.setState({ isDefaultContextEnabled: true } as never);

    expect(selectIsDefaultContextEnabled()).toBe(true);
  });
});
