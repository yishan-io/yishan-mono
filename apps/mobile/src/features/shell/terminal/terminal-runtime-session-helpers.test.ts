import { describe, expect, it } from "vitest";

import {
  bindTerminalSessionStartLease,
  buildStartWorkspaceTerminalInput,
  buildStartedTerminalSessionSummary,
  buildTerminalLaunchInput,
  releaseTerminalSessionStartLease,
  resetTerminalRuntimeSnapshot,
  resetTerminalSessionStartLease,
  shouldSkipTerminalSessionStart,
  tryClaimTerminalSessionStartLease,
} from "./terminal-runtime-session-helpers";

describe("terminal-runtime-session-helpers", () => {
  it("builds a start payload with pane and measured size", () => {
    expect(
      buildStartWorkspaceTerminalInput("workspace-1", "terminal-1", {
        cols: 120,
        rows: 48,
      }),
    ).toEqual({
      cols: 120,
      paneId: "pane-workspace-1",
      rows: 48,
      tabId: "terminal-1",
    });
  });

  it("builds a start payload without measured size", () => {
    expect(buildStartWorkspaceTerminalInput("workspace-1", "terminal-1")).toEqual({
      paneId: "pane-workspace-1",
      tabId: "terminal-1",
    });
  });

  it("builds the minimal running session summary", () => {
    expect(buildStartedTerminalSessionSummary("workspace-1", "session-1")).toEqual({
      sessionId: "session-1",
      status: "running",
      workspaceId: "workspace-1",
    });
  });

  it("returns null when there is no terminal launch command", () => {
    expect(buildTerminalLaunchInput({ agentKind: "codex", launchCommand: null })).toBeNull();
    expect(buildTerminalLaunchInput({ agentKind: "codex", launchCommand: "   " })).toBeNull();
  });

  it("builds an exec launch input for agent-backed sessions", () => {
    expect(buildTerminalLaunchInput({ agentKind: "codex", launchCommand: "codex --continue" })).toBe(
      "exec codex --continue\r",
    );
  });

  it("does not inject exec for non-agent launch commands", () => {
    expect(buildTerminalLaunchInput({ agentKind: undefined, launchCommand: "npm test" })).toBe("npm test\r");
  });

  it("resets all runtime snapshot flags", () => {
    const snapshot = {
      ensuredSessionId: "session-1",
      ensuring: true,
      exited: true,
      starting: true,
      transportSessionId: "session-1",
    };

    resetTerminalRuntimeSnapshot(snapshot);

    expect(snapshot).toEqual({
      ensuredSessionId: null,
      ensuring: false,
      exited: false,
      starting: false,
      transportSessionId: null,
    });
  });

  it("skips terminal start while one start is already in flight", () => {
    expect(
      shouldSkipTerminalSessionStart({
        existingSessionId: null,
        snapshot: {
          ensuredSessionId: null,
          starting: true,
        },
      }),
    ).toBe(true);
  });

  it("skips terminal start after the runtime has already bound a session", () => {
    expect(
      shouldSkipTerminalSessionStart({
        existingSessionId: null,
        snapshot: {
          ensuredSessionId: "session-1",
          starting: false,
        },
      }),
    ).toBe(true);
  });

  it("skips terminal start when the terminal already carries a session id", () => {
    expect(
      shouldSkipTerminalSessionStart({
        existingSessionId: "session-1",
        snapshot: {
          ensuredSessionId: null,
          starting: false,
        },
      }),
    ).toBe(true);
  });

  it("allows terminal start when runtime is still unbound", () => {
    expect(
      shouldSkipTerminalSessionStart({
        existingSessionId: null,
        snapshot: {
          ensuredSessionId: null,
          starting: false,
        },
      }),
    ).toBe(false);
  });

  it("only allows one in-flight start lease per terminal id", () => {
    resetTerminalSessionStartLease("terminal-1");

    expect(tryClaimTerminalSessionStartLease("terminal-1")).toBe(true);
    expect(tryClaimTerminalSessionStartLease("terminal-1")).toBe(false);

    releaseTerminalSessionStartLease("terminal-1");
    expect(tryClaimTerminalSessionStartLease("terminal-1")).toBe(true);

    releaseTerminalSessionStartLease("terminal-1");
  });

  it("keeps the lease claimed after a session binds until an explicit reset", () => {
    resetTerminalSessionStartLease("terminal-2");

    expect(tryClaimTerminalSessionStartLease("terminal-2")).toBe(true);
    bindTerminalSessionStartLease("terminal-2", "session-2");
    releaseTerminalSessionStartLease("terminal-2");

    expect(tryClaimTerminalSessionStartLease("terminal-2")).toBe(false);

    resetTerminalSessionStartLease("terminal-2");
    expect(tryClaimTerminalSessionStartLease("terminal-2")).toBe(true);

    releaseTerminalSessionStartLease("terminal-2");
  });
});
