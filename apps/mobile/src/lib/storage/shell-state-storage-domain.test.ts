import { describe, expect, it } from "vitest";

import type { TerminalItem } from "@/features/shell/state/shell.types";

import {
  dedupeGhostTerminals,
  normalizeStoredTerminalSession,
  toPersistedShellState,
} from "./shell-state-storage-domain";

describe("shell-state-storage-domain", () => {
  it("drops invalid terminal session payloads", () => {
    expect(normalizeStoredTerminalSession(null, "w1")).toBeNull();
  });

  it("dedupes empty ghost terminals by recency", () => {
    const terminals = [
      {
        id: "old",
        label: "Codex",
        orgId: "o",
        projectId: "p",
        workspaceId: "w",
        updatedAt: "2026-06-15T00:00:00.000Z",
        createdAt: "2026-06-15T00:00:00.000Z",
      },
      {
        id: "new",
        label: "Codex",
        orgId: "o",
        projectId: "p",
        workspaceId: "w",
        updatedAt: "2026-06-16T00:00:00.000Z",
        createdAt: "2026-06-16T00:00:00.000Z",
      },
    ] as TerminalItem[];

    expect(dedupeGhostTerminals(terminals).map((terminal) => terminal.id)).toEqual(["new"]);
  });

  it("drops detached workspace state and persists imported terminal ownership", () => {
    const state = toPersistedShellState({
      paneLayoutByWorkspaceId: {
        __detached__: {
          activePaneId: "pane-detached",
          root: { id: "pane-detached", kind: "leaf", selectedTabId: "", tabIds: [] },
        },
        w1: {
          activePaneId: "pane-1",
          root: { id: "pane-1", kind: "leaf", selectedTabId: "tab-1", tabIds: ["tab-1"] },
        },
      },
      selectedNodeIdByOrganization: {},
      terminalsByWorkspaceId: {
        __detached__: [],
        w1: [
          {
            createdAt: "2026-06-18T00:00:00.000Z",
            id: "terminal-session-s1",
            importedFromBackend: true,
            label: "Terminal 11:24",
            orgId: "o1",
            projectId: "p1",
            updatedAt: "2026-06-18T00:00:00.000Z",
            workspaceId: "w1",
          },
        ] as TerminalItem[],
      },
      workspaceTabStateByWorkspaceId: {
        __detached__: { selectedTabId: "", tabs: [], workspaceId: "__detached__" },
        w1: { selectedTabId: "tab-1", tabs: [], workspaceId: "w1" },
      },
    });

    expect(state.paneLayoutByWorkspaceId.__detached__).toBeUndefined();
    expect(state.terminalsByWorkspaceId.__detached__).toBeUndefined();
    expect(state.workspaceTabStateByWorkspaceId.__detached__).toBeUndefined();
    expect(state.workspaceTabStateByWorkspaceId.w1?.selectedTabId).toBe("tab-1");
    expect(state.terminalsByWorkspaceId.w1?.[0]?.importedFromBackend).toBe(true);
  });
});
