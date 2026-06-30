import { describe, expect, it } from "vitest";

import type { TerminalItem } from "../state/shell.types";
import { buildExitedTerminalRuntimePatch, mergePendingTerminalOutputMap } from "./terminal-transport-output-domain";

function createTerminal(overrides: Partial<TerminalItem> = {}): TerminalItem {
  return {
    id: "terminal-1",
    label: "Terminal",
    orgId: "org-1",
    projectId: "project-1",
    updatedAt: "2026-06-16T00:00:00.000Z",
    workspaceId: "workspace-1",
    ...overrides,
  };
}

describe("terminal-transport-output-domain", () => {
  it("builds the exited runtime patch from rendered output", () => {
    const terminal = createTerminal({
      lastMessagePreview: "old",
      session: { sessionId: "session-1", status: "running", workspaceId: "workspace-1" },
    });

    expect(buildExitedTerminalRuntimePatch(terminal, "done\n")).toEqual({
      cachedOutput: "done\n",
      lastMessagePreview: "done",
      session: { sessionId: "session-1", status: "exited", workspaceId: "workspace-1" },
      status: "idle",
    });
  });

  it("merges pending terminal output only when values change", () => {
    const current = { "terminal-1": "same" };
    expect(mergePendingTerminalOutputMap(current, { "terminal-1": "same" })).toBe(current);
    expect(mergePendingTerminalOutputMap(current, { "terminal-1": "next" })).toEqual({ "terminal-1": "next" });
  });
});
