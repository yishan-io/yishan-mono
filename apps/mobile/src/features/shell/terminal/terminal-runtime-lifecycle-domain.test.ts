import { describe, expect, it } from "vitest";

import type { TerminalItem } from "../state/shell.types";
import {
  classifyTerminalRuntimeCleanup,
  resolveSelectedTerminalRuntimeAction,
} from "./terminal-runtime-lifecycle-domain";

function createTerminal(overrides: Partial<TerminalItem> = {}): TerminalItem {
  return {
    id: "terminal-1",
    label: "Terminal",
    orgId: "org-1",
    projectId: "project-1",
    status: "idle",
    updatedAt: "2026-06-16T00:00:00.000Z",
    workspaceId: "workspace-1",
    ...overrides,
  };
}

describe("terminal-runtime-lifecycle-domain", () => {
  it("requests attach-or-create when snapshot does not match selected session", () => {
    const terminal = createTerminal({
      session: { sessionId: "session-1", status: "running", workspaceId: "workspace-1" },
      status: "running",
    });

    expect(
      resolveSelectedTerminalRuntimeAction({
        accessToken: "token",
        getRuntimeSnapshot: () => ({ ensuredSessionId: null }),
        selectedTerminalId: terminal.id,
        status: "authenticated",
        terminalsById: { [terminal.id]: terminal },
      }),
    ).toEqual({ kind: "attach-or-create", terminal });
  });

  it("requests transport connect when selected terminal is already ensured and running", () => {
    const terminal = createTerminal({
      session: { sessionId: "session-1", status: "running", workspaceId: "workspace-1" },
      status: "waiting_input",
    });

    expect(
      resolveSelectedTerminalRuntimeAction({
        accessToken: "token",
        getRuntimeSnapshot: () => ({ ensuredSessionId: "session-1" }),
        selectedTerminalId: terminal.id,
        status: "authenticated",
        terminalsById: { [terminal.id]: terminal },
      }),
    ).toEqual({ kind: "connect-transport", sessionId: "session-1", terminal });
  });

  it("requests transport reconnect when selected terminal has an ensured session but transport failed", () => {
    const terminal = createTerminal({
      session: { sessionId: "session-1", status: "running", workspaceId: "workspace-1" },
      status: "error",
    });

    expect(
      resolveSelectedTerminalRuntimeAction({
        accessToken: "token",
        getRuntimeSnapshot: () => ({ ensuredSessionId: "session-1" }),
        selectedTerminalId: terminal.id,
        status: "authenticated",
        terminalsById: { [terminal.id]: terminal },
      }),
    ).toEqual({ kind: "connect-transport", sessionId: "session-1", terminal });
  });

  it("requests start when selected terminal is initializing without a session", () => {
    const terminal = createTerminal({ status: "initializing" });

    expect(
      resolveSelectedTerminalRuntimeAction({
        accessToken: "token",
        getRuntimeSnapshot: () => ({ ensuredSessionId: null }),
        selectedTerminalId: terminal.id,
        status: "authenticated",
        terminalsById: { [terminal.id]: terminal },
      }),
    ).toEqual({ kind: "schedule-start", terminal });
  });

  it("only classifies stale runtime ids for cleanup", () => {
    expect(
      classifyTerminalRuntimeCleanup({
        existingTerminalIds: new Set(["terminal-1", "terminal-2"]),
        runtimeTerminalIds: ["terminal-1", "terminal-2", "terminal-3"],
      }),
    ).toEqual({
      staleTerminalIds: ["terminal-3"],
    });
  });
});
