import { describe, expect, it } from "vitest";

import { syncTerminalMapForWorkspaceTabs } from "./shell-stored-state-helpers";
import type { ShellWorkspaceTabState, TerminalItem } from "./shell.types";

const WORKSPACE_ID = "workspace-1";

function createTerminalTabState(): ShellWorkspaceTabState {
  return {
    selectedTabId: "terminal:terminal-1",
    tabs: [
      {
        data: {
          agentKind: "codex",
          launchCommand: "codex",
          paneId: "pane-terminal-1",
          sessionId: "session-1",
          terminalId: "terminal-1",
          title: "Terminal",
        },
        id: "terminal:terminal-1",
        kind: "terminal",
        pinned: false,
        title: "Terminal",
        workspaceId: WORKSPACE_ID,
      },
    ],
    workspaceId: WORKSPACE_ID,
  };
}

describe("shell-stored-state-helpers", () => {
  it("materializes missing terminal runtime from restored terminal tabs", () => {
    const next = syncTerminalMapForWorkspaceTabs(
      {},
      {
        nodeId: "node-1",
        orgId: "org-1",
        projectId: "project-1",
        tabState: createTerminalTabState(),
        workspaceId: WORKSPACE_ID,
        workspaceLabel: "base",
      },
    );

    expect(next[WORKSPACE_ID]).toEqual([
      expect.objectContaining({
        agentKind: "codex",
        id: "terminal-1",
        label: "Terminal",
        launchCommand: "codex",
        nodeId: "node-1",
        orgId: "org-1",
        projectId: "project-1",
        session: expect.objectContaining({
          paneId: "pane-terminal-1",
          sessionId: "session-1",
          tabId: "terminal:terminal-1",
          workspaceId: WORKSPACE_ID,
        }),
        subtitle: "base",
        workspaceId: WORKSPACE_ID,
      }),
    ]);
  });

  it("drops terminal runtime entries that no longer have a backing tab", () => {
    const current: Record<string, TerminalItem[]> = {
      [WORKSPACE_ID]: [
        {
          id: "terminal-1",
          label: "Terminal",
          orgId: "org-1",
          projectId: "project-1",
          updatedAt: "2026-06-20T00:00:00.000Z",
          workspaceId: WORKSPACE_ID,
        },
      ],
    };

    const next = syncTerminalMapForWorkspaceTabs(current, {
      nodeId: "node-1",
      orgId: "org-1",
      projectId: "project-1",
      tabState: {
        selectedTabId: "",
        tabs: [],
        workspaceId: WORKSPACE_ID,
      },
      workspaceId: WORKSPACE_ID,
      workspaceLabel: "base",
    });

    expect(next[WORKSPACE_ID]).toBeUndefined();
  });
});
