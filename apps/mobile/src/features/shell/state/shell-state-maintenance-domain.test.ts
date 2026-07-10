import { describe, expect, it } from "vitest";

import {
  dropProjectStoredState,
  dropWorkspaceStoredState,
  listRecentTerminals,
} from "./shell-state-maintenance-domain";
import type { ShellSelection, TerminalItem } from "./shell.types";

function createTerminal(id: string, workspaceId: string, updatedAt: string): TerminalItem {
  return {
    id,
    label: id,
    orgId: "org-1",
    projectId: "project-1",
    updatedAt,
    workspaceId,
  };
}

describe("shell-state-maintenance-domain", () => {
  it("drops one workspace and resets selection when it was active", () => {
    const selection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };

    const result = dropWorkspaceStoredState(
      {
        paneLayoutByWorkspaceId: {
          "workspace-1": {
            activePaneId: "pane-1",
            root: { id: "pane-1", kind: "leaf", selectedTabId: "tab-1", tabIds: ["tab-1"] },
          },
          "workspace-2": {
            activePaneId: "pane-2",
            root: { id: "pane-2", kind: "leaf", selectedTabId: "tab-2", tabIds: ["tab-2"] },
          },
        },
        terminalsByWorkspaceId: {
          "workspace-1": [createTerminal("terminal-1", "workspace-1", "2026-06-16T10:00:00.000Z")],
          "workspace-2": [createTerminal("terminal-2", "workspace-2", "2026-06-16T11:00:00.000Z")],
        },
        workspaceTabStateByWorkspaceId: {
          "workspace-1": { selectedTabId: "tab-1", tabs: [], workspaceId: "workspace-1" },
          "workspace-2": { selectedTabId: "tab-2", tabs: [], workspaceId: "workspace-2" },
        },
      },
      selection,
      "workspace-1",
    );

    expect(result.workspaceTerminalIds).toEqual(["terminal-1"]);
    expect(result.nextSelection).toEqual({ kind: "home" });
    expect(Object.keys(result.nextTerminalsByWorkspaceId)).toEqual(["workspace-2"]);
    expect(Object.keys(result.nextWorkspaceTabStateByWorkspaceId)).toEqual(["workspace-2"]);
    expect(Object.keys(result.nextPaneLayoutByWorkspaceId)).toEqual(["workspace-2"]);
  });

  it("drops one project and resets project-scoped selection", () => {
    const selection: ShellSelection = {
      kind: "workspace",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    };

    const result = dropProjectStoredState(
      {
        paneLayoutByWorkspaceId: {
          "workspace-1": {
            activePaneId: "pane-1",
            root: { id: "pane-1", kind: "leaf", selectedTabId: "tab-1", tabIds: ["tab-1"] },
          },
          "workspace-2": {
            activePaneId: "pane-2",
            root: { id: "pane-2", kind: "leaf", selectedTabId: "tab-2", tabIds: ["tab-2"] },
          },
        },
        terminalsByWorkspaceId: {
          "workspace-1": [createTerminal("terminal-1", "workspace-1", "2026-06-16T10:00:00.000Z")],
          "workspace-2": [createTerminal("terminal-2", "workspace-2", "2026-06-16T11:00:00.000Z")],
        },
        workspaceTabStateByWorkspaceId: {
          "workspace-1": { selectedTabId: "tab-1", tabs: [], workspaceId: "workspace-1" },
          "workspace-2": { selectedTabId: "tab-2", tabs: [], workspaceId: "workspace-2" },
        },
      },
      selection,
      "org-1",
      "project-1",
      ["workspace-1", "workspace-2"],
    );

    expect(result.projectTerminalIds).toEqual(["terminal-1", "terminal-2"]);
    expect(result.nextSelection).toEqual({ kind: "home" });
    expect(result.nextTerminalsByWorkspaceId).toEqual({});
    expect(result.nextWorkspaceTabStateByWorkspaceId).toEqual({});
    expect(result.nextPaneLayoutByWorkspaceId).toEqual({});
  });

  it("lists recent terminals newest first across workspaces", () => {
    const result = listRecentTerminals(
      {
        "workspace-1": [
          createTerminal("terminal-1", "workspace-1", "2026-06-16T10:00:00.000Z"),
          createTerminal("terminal-2", "workspace-1", "2026-06-16T12:00:00.000Z"),
        ],
        "workspace-2": [createTerminal("terminal-3", "workspace-2", "2026-06-16T11:00:00.000Z")],
      },
      2,
    );

    expect(result.map((terminal) => terminal.id)).toEqual(["terminal-2", "terminal-3"]);
  });
});
