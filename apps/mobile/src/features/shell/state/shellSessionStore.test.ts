import { describe, expect, it } from "vitest";

import {
  getShellSessionRestorePromise,
  getShellSessionStateSnapshot,
  resetShellSessionStateForTests,
  setShellSessionHasRestoredStoredState,
  setShellSessionPaneLayoutByWorkspaceId,
  setShellSessionRestorePromise,
  setShellSessionSelectedNodeIdByOrganization,
  setShellSessionTerminalsByWorkspaceId,
  setShellSessionWorkspaceTabStateByWorkspaceId,
} from "./shellSessionStore";

describe("shellSessionStore", () => {
  it("retains shell runtime state across repeated snapshot reads", () => {
    resetShellSessionStateForTests();

    setShellSessionHasRestoredStoredState(true);
    setShellSessionSelectedNodeIdByOrganization({ "org-1": "node-1" });
    setShellSessionTerminalsByWorkspaceId({
      "workspace-1": [
        {
          id: "terminal-1",
          label: "Terminal",
          orgId: "org-1",
          projectId: "project-1",
          updatedAt: "2026-06-20T00:00:00.000Z",
          workspaceId: "workspace-1",
        },
      ],
    });
    setShellSessionWorkspaceTabStateByWorkspaceId({
      "workspace-1": {
        selectedTabId: "file:README.md",
        tabs: [
          {
            data: { isTemporary: false, path: "README.md" },
            id: "file:README.md",
            kind: "file",
            pinned: false,
            title: "README.md",
            workspaceId: "workspace-1",
          },
        ],
        workspaceId: "workspace-1",
      },
    });
    setShellSessionPaneLayoutByWorkspaceId({
      "workspace-1": {
        activePaneId: "pane-1",
        root: {
          id: "pane-1",
          kind: "leaf",
          selectedTabId: "file:README.md",
          tabIds: ["file:README.md"],
        },
      },
    });

    const firstSnapshot = getShellSessionStateSnapshot();
    const secondSnapshot = getShellSessionStateSnapshot();

    expect(firstSnapshot).toEqual(secondSnapshot);
    expect(secondSnapshot.workspaceTabStateByWorkspaceId["workspace-1"]?.selectedTabId).toBe("file:README.md");
    expect(secondSnapshot.paneLayoutByWorkspaceId["workspace-1"]?.activePaneId).toBe("pane-1");
    expect(secondSnapshot.terminalsByWorkspaceId["workspace-1"]?.[0]?.id).toBe("terminal-1");
    expect(secondSnapshot.selectedNodeIdByOrganization["org-1"]).toBe("node-1");
    expect(secondSnapshot.hasRestoredStoredState).toBe(true);
  });

  it("clears the restore sentinel together with runtime state reset", () => {
    resetShellSessionStateForTests();

    setShellSessionHasRestoredStoredState(true);
    setShellSessionRestorePromise(Promise.resolve());

    resetShellSessionStateForTests();

    expect(getShellSessionStateSnapshot().hasRestoredStoredState).toBe(false);
    expect(getShellSessionRestorePromise()).toBeNull();
  });
});
