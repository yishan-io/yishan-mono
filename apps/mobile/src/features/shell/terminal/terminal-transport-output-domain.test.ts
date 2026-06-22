import { describe, expect, it } from "vitest";

import type { TerminalItem } from "../state/shell.types";
import {
  buildExitedTerminalRuntimePatch,
  buildTrimmedTerminalOutput,
  mergePendingTerminalOutputMap,
} from "./terminal-transport-output-domain";

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
  it("builds trimmed terminal output in append and replace modes", () => {
    expect(buildTrimmedTerminalOutput("hello", " world")).toBe("hello world");
    expect(buildTrimmedTerminalOutput("hello", "reset", true)).toBe("reset");
  });

  it("ignores replayed output that is already present at the end of the buffer", () => {
    const output = "If you want, I can also give you a quick map of the repo by folder.\n";

    expect(buildTrimmedTerminalOutput(output, output)).toBe(output);
  });

  it("merges overlapping replay output without duplicating the shared suffix", () => {
    const previousOutput = [
      "Working (0s • esc to interrupt)\n",
      "Running 3 UserPromptSubmit hooks\n",
      "If you want, I can also give you a quick map of the repo by folder, ",
    ].join("");
    const nextChunk =
      "If you want, I can also give you a quick map of the repo by folder, or explain how the desktop app and CLI fit together.\n";

    expect(buildTrimmedTerminalOutput(previousOutput, nextChunk)).toBe(
      `${previousOutput}or explain how the desktop app and CLI fit together.\n`,
    );
  });

  it("still appends short repeated chunks normally", () => {
    expect(buildTrimmedTerminalOutput("ok\n", "ok\n")).toBe("ok\nok\n");
  });

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
