import { describe, expect, it } from "vitest";

import { createEmptyWorkspacePaneStoreState } from "../state/shell-state-helpers";
import { upsertWorkspacePreviewStoreState, upsertWorkspaceTerminalStoreState } from "../state/shellPaneStoreUpsert";
import { buildClosePaneTabStoreMutation, buildSelectPaneTabStoreMutation } from "./shell-pane-command-domain";

const WORKSPACE_ID = "workspace-1";
const createTerminal = (id: string) => ({ id, label: "Terminal" });

describe("shell-pane-command-domain", () => {
  it("returns null when selecting the already active pane tab", () => {
    const storeState = upsertWorkspaceTerminalStoreState(null, WORKSPACE_ID, createTerminal("terminal-1"));

    expect(buildSelectPaneTabStoreMutation(storeState, "terminal:terminal-1", "terminal:terminal-1")).toBeNull();
  });

  it("builds a select mutation when switching to another tab", () => {
    const withTerminal = upsertWorkspaceTerminalStoreState(null, WORKSPACE_ID, createTerminal("terminal-1"));
    const storeState = upsertWorkspacePreviewStoreState(withTerminal, WORKSPACE_ID, {
      kind: "file",
      path: "README.md",
    });

    const mutation = buildSelectPaneTabStoreMutation(storeState, "file:README.md", "terminal:terminal-1");

    expect(mutation?.tabState.selectedTabId).toBe("terminal:terminal-1");
  });

  it("returns null when closing a tab that is not present", () => {
    const storeState = createEmptyWorkspacePaneStoreState(WORKSPACE_ID);

    expect(buildClosePaneTabStoreMutation(storeState, "file:README.md")).toBeNull();
  });

  it("marks route sync as required when closing the active tab", () => {
    const withTerminal = upsertWorkspaceTerminalStoreState(null, WORKSPACE_ID, createTerminal("terminal-1"));
    const storeState = upsertWorkspacePreviewStoreState(withTerminal, WORKSPACE_ID, {
      kind: "file",
      path: "README.md",
    });

    const mutation = buildClosePaneTabStoreMutation(storeState, "file:README.md");

    expect(mutation?.shouldSyncRoute).toBe(true);
    expect(mutation?.nextStoreState.tabState.tabs.map((tab) => tab.id)).toEqual(["terminal:terminal-1"]);
  });

  it("does not force route sync when closing an inactive tab", () => {
    const withTerminal = upsertWorkspaceTerminalStoreState(null, WORKSPACE_ID, createTerminal("terminal-1"));
    const selectedTerminal = buildSelectPaneTabStoreMutation(withTerminal, null, "terminal:terminal-1") ?? withTerminal;
    const storeState = upsertWorkspacePreviewStoreState(selectedTerminal, WORKSPACE_ID, {
      kind: "file",
      path: "README.md",
    });
    const reselectedTerminal =
      buildSelectPaneTabStoreMutation(storeState, "file:README.md", "terminal:terminal-1") ?? storeState;

    const mutation = buildClosePaneTabStoreMutation(reselectedTerminal, "file:README.md");

    expect(mutation?.shouldSyncRoute).toBe(false);
    expect(mutation?.nextStoreState.tabState.selectedTabId).toBe("terminal:terminal-1");
  });
});
