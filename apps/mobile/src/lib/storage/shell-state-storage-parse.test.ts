import { describe, expect, it } from "vitest";

import { parseStoredShellState, parseStoredTerminalRuntimeState } from "./shell-state-storage-parse";

describe("shell-state-storage-parse", () => {
  it("rejects unsupported shell snapshots that omit terminal workspace state", () => {
    expect(
      parseStoredShellState(
        JSON.stringify({
          sessionsByWorkspaceId: {
            w1: [],
          },
        }),
      ),
    ).toBeNull();
  });

  it("does not synthesize terminal sessions from removed backendSessionId fields", () => {
    const state = parseStoredTerminalRuntimeState(
      JSON.stringify({
        w1: [
          {
            id: "t1",
            backendSessionId: "s1",
            cachedOutput: "output",
          },
        ],
      }),
    );

    expect(state.w1?.[0]).toEqual({
      id: "t1",
      cachedOutput: "output",
      session: null,
    });
  });

  it("parses supported pane/tab snapshot fields when present", () => {
    const state = parseStoredShellState(
      JSON.stringify({
        paneLayoutByWorkspaceId: {
          w1: {
            activePaneId: "pane-root",
            root: { id: "pane-root", kind: "leaf", selectedTabId: "tab-1", tabIds: ["tab-1"] },
          },
        },
        terminalsByWorkspaceId: {
          w1: [],
        },
        workspaceTabStateByWorkspaceId: {
          w1: {
            selectedTabId: "t1",
            tabs: [],
            workspaceId: "w1",
          },
        },
      }),
    );

    expect(state).toEqual({
      paneLayoutByWorkspaceId: {
        w1: {
          activePaneId: "pane-root",
          root: { id: "pane-root", kind: "leaf", selectedTabId: "tab-1", tabIds: ["tab-1"] },
        },
      },
      selectedNodeIdByOrganization: {},
      terminalsByWorkspaceId: {
        w1: [],
      },
      workspaceTabStateByWorkspaceId: {
        w1: {
          selectedTabId: "t1",
          tabs: [],
          workspaceId: "w1",
        },
      },
    });
  });

  it("backfills imported terminal ownership from mirrored terminal ids and drops detached workspace snapshots", () => {
    const state = parseStoredShellState(
      JSON.stringify({
        paneLayoutByWorkspaceId: {
          __detached__: {
            activePaneId: "pane-root",
            root: { id: "pane-root", kind: "leaf", selectedTabId: "", tabIds: [] },
          },
        },
        terminalsByWorkspaceId: {
          __detached__: [],
          w1: [
            {
              createdAt: "2026-06-18T00:00:00.000Z",
              id: "terminal-session-s1",
              label: "New terminal",
              orgId: "o1",
              projectId: "p1",
              updatedAt: "2026-06-18T00:00:00.000Z",
              workspaceId: "w1",
            },
          ],
        },
        workspaceTabStateByWorkspaceId: {
          __detached__: {
            selectedTabId: "",
            tabs: [],
            workspaceId: "__detached__",
          },
        },
      }),
    );

    expect(state?.terminalsByWorkspaceId.__detached__).toBeUndefined();
    expect(state?.paneLayoutByWorkspaceId.__detached__).toBeUndefined();
    expect(state?.terminalsByWorkspaceId.w1?.[0]?.importedFromBackend).toBe(true);
    expect(state?.workspaceTabStateByWorkspaceId.__detached__).toBeUndefined();
  });

  it("falls back to empty pane/tab maps when older snapshots omit them", () => {
    const state = parseStoredShellState(
      JSON.stringify({
        terminalsByWorkspaceId: {
          w1: [],
        },
      }),
    );

    expect(state?.paneLayoutByWorkspaceId).toEqual({});
    expect(state?.workspaceTabStateByWorkspaceId).toEqual({});
  });
});
