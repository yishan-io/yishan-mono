import { describe, expect, it } from "vitest";

import { sanitizeWorkspacePaneStoreState } from "./shellPaneStoreSanitize";
import {
  upsertWorkspacePreviewStoreState,
  upsertWorkspaceTerminalStoreState,
  upsertWorkspaceTerminalTabsStoreState,
} from "./shellPaneStoreUpsert";

const WORKSPACE_ID = "workspace-1";
const createTerminal = (id: string) => ({ id, label: "Terminal" });

describe("shell pane state machine flows", () => {
  it("opens a new preview tab instead of reusing a temporary preview tab", () => {
    const firstStoreState = upsertWorkspacePreviewStoreState(null, WORKSPACE_ID, {
      kind: "file",
      path: "README.md",
    });

    const secondStoreState = upsertWorkspacePreviewStoreState(firstStoreState, WORKSPACE_ID, {
      kind: "file",
      path: "CONTRIBUTING.md",
    });

    expect(secondStoreState.tabState.tabs.map((tab) => tab.id)).toEqual(["file:README.md", "file:CONTRIBUTING.md"]);
    expect(secondStoreState.tabState.selectedTabId).toBe("file:CONTRIBUTING.md");
    expect(firstStoreState.tabState.tabs[0]).toMatchObject({
      data: {
        isTemporary: false,
      },
    });
    expect(secondStoreState.tabState.tabs[1]).toMatchObject({
      data: {
        isTemporary: false,
      },
    });
  });

  it("keeps terminal tabs even when terminal metadata has not been restored yet", () => {
    const withFirstTerminal = upsertWorkspaceTerminalStoreState(null, WORKSPACE_ID, createTerminal("terminal-1"));
    const withSecondTerminal = upsertWorkspaceTerminalStoreState(
      withFirstTerminal,
      WORKSPACE_ID,
      createTerminal("terminal-2"),
    );

    const sanitized = sanitizeWorkspacePaneStoreState(withSecondTerminal, WORKSPACE_ID);

    expect(sanitized.tabState.tabs.map((tab) => tab.id)).toEqual(["terminal:terminal-1", "terminal:terminal-2"]);
    expect(sanitized.tabState.selectedTabId).toBe("terminal:terminal-2");
  });

  it("does not remove terminal tabs when backend sync reports none remaining", () => {
    const withTerminal = upsertWorkspaceTerminalStoreState(null, WORKSPACE_ID, createTerminal("terminal-1"));

    const sanitized = sanitizeWorkspacePaneStoreState(withTerminal, WORKSPACE_ID);

    expect(sanitized.tabState.tabs.map((tab) => tab.id)).toEqual(["terminal:terminal-1"]);
    expect(sanitized.tabState.selectedTabId).toBe("terminal:terminal-1");
  });

  it("preserves the current selected non-terminal tab when syncing backend terminals", () => {
    const withPreview = upsertWorkspacePreviewStoreState(null, WORKSPACE_ID, {
      kind: "file",
      path: "README.md",
    });

    const synced = upsertWorkspaceTerminalTabsStoreState(withPreview, WORKSPACE_ID, [
      createTerminal("terminal-1"),
      createTerminal("terminal-2"),
    ]);

    expect(synced.tabState.tabs.map((tab) => tab.id)).toEqual([
      "file:README.md",
      "terminal:terminal-1",
      "terminal:terminal-2",
    ]);
    expect(synced.tabState.selectedTabId).toBe("file:README.md");
  });
});
