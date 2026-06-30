import { describe, expect, it } from "vitest";

import {
  buildStoredShellStateSnapshot,
  listWorkspaceBrowserStateIdsForCleanup,
} from "./shell-state-maintenance-persistence-domain";

describe("shell-state-maintenance-persistence-domain", () => {
  it("builds persisted shell snapshot from maintenance state", () => {
    expect(
      buildStoredShellStateSnapshot({
        nextPaneLayoutByWorkspaceId: {
          "workspace-1": {
            activePaneId: "pane-1",
            root: { id: "pane-1", kind: "leaf", selectedTabId: "tab-1", tabIds: ["tab-1"] },
          },
        },
        nextTerminalsByWorkspaceId: {
          "workspace-1": [
            {
              id: "terminal-1",
              label: "Terminal",
              orgId: "org-1",
              projectId: "project-1",
              updatedAt: "2026-06-16T00:00:00.000Z",
              workspaceId: "workspace-1",
            },
          ],
        },
        nextWorkspaceTabStateByWorkspaceId: {
          "workspace-1": { selectedTabId: "tab-1", tabs: [], workspaceId: "workspace-1" },
        },
        selectedNodeIdByOrganization: { "org-1": "node-1" },
      }),
    ).toEqual({
      paneLayoutByWorkspaceId: {
        "workspace-1": {
          activePaneId: "pane-1",
          root: { id: "pane-1", kind: "leaf", selectedTabId: "tab-1", tabIds: ["tab-1"] },
        },
      },
      selectedNodeIdByOrganization: { "org-1": "node-1" },
      terminalsByWorkspaceId: {
        "workspace-1": [
          {
            id: "terminal-1",
            label: "Terminal",
            orgId: "org-1",
            projectId: "project-1",
            updatedAt: "2026-06-16T00:00:00.000Z",
            workspaceId: "workspace-1",
          },
        ],
      },
      workspaceTabStateByWorkspaceId: {
        "workspace-1": { selectedTabId: "tab-1", tabs: [], workspaceId: "workspace-1" },
      },
    });
  });

  it("lists workspace browser state ids for cleanup", () => {
    expect(listWorkspaceBrowserStateIdsForCleanup("org-1", "project-1", ["workspace-1", "workspace-2"])).toEqual([
      "org-1:project-1:workspace-1",
      "org-1:project-1:workspace-2",
    ]);
  });
});
