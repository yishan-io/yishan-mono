// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  WORKSPACE_SETTINGS_STORE_STORAGE_KEY,
  workspaceSettingsStore,
} from "../../store/settings/workspaceSettingsStore";
import { WorkspaceSettingsView } from "./WorkspaceSettingsView";

describe("WorkspaceSettingsView", () => {
  afterEach(() => {
    workspaceSettingsStore.setState({ isDefaultContextEnabled: true });
    window.localStorage.clear();
    cleanup();
  });

  it("renders the current default context state", () => {
    render(<WorkspaceSettingsView />);

    expect(screen.getByText("settings.workspace.defaultContext.status.enabled")).toBeTruthy();
  });

  it("persists default context toggle edits", () => {
    render(<WorkspaceSettingsView />);

    fireEvent.click(screen.getByRole("switch", { name: "settings.workspace.defaultContext.label" }));

    expect(workspaceSettingsStore.getState().isDefaultContextEnabled).toBe(false);
    expect(window.localStorage.getItem(WORKSPACE_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"isDefaultContextEnabled":false',
    );
    expect(screen.getByText("settings.workspace.defaultContext.status.disabled")).toBeTruthy();
  });
});
