import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalWriteRuntime } from "../components/shell-terminal-dom-emulator-runtime";
import {
  appendTerminalOutputRuntime,
  clearTerminalOutputRuntime,
  deleteTerminalOutputRuntime,
  listTerminalOutputRuntimeIds,
  mountTerminalOutputRuntime,
  readTerminalOutputRuntimeSnapshot,
  replaceTerminalOutputRuntime,
  unmountTerminalOutputRuntime,
} from "./terminalOutputRuntimeRegistry";

function createTerminalRuntime(): TerminalWriteRuntime {
  return {
    blur: vi.fn(),
    focus: vi.fn(),
    reset: vi.fn(),
    scrollLines: vi.fn(),
    scrollToBottom: vi.fn(),
    write: vi.fn(),
  };
}

function clearAllTerminalOutputRuntimes() {
  for (const terminalId of listTerminalOutputRuntimeIds()) {
    deleteTerminalOutputRuntime(terminalId);
  }
}

describe("terminalOutputRuntimeRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearAllTerminalOutputRuntimes();
  });

  afterEach(() => {
    clearAllTerminalOutputRuntimes();
    vi.useRealTimers();
  });

  it("mounts one runtime with fallback output and restores it immediately", () => {
    const terminal = createTerminalRuntime();

    mountTerminalOutputRuntime({
      fallbackOutput: "hello",
      terminal,
      terminalId: "terminal-1",
    });

    expect(terminal.reset).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledWith("hello");
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(readTerminalOutputRuntimeSnapshot("terminal-1")).toBe("hello");
  });

  it("batches appended output into one runtime flush", () => {
    const terminal = createTerminalRuntime();

    mountTerminalOutputRuntime({
      terminal,
      terminalId: "terminal-1",
    });

    vi.clearAllMocks();

    appendTerminalOutputRuntime("terminal-1", "a");
    appendTerminalOutputRuntime("terminal-1", "b");

    expect(terminal.write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);

    expect(terminal.write).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledWith("ab");
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(readTerminalOutputRuntimeSnapshot("terminal-1")).toBe("ab");
  });

  it("replaces mounted runtime output by resetting and rewriting the full snapshot", () => {
    const terminal = createTerminalRuntime();

    mountTerminalOutputRuntime({
      fallbackOutput: "before",
      terminal,
      terminalId: "terminal-1",
    });

    vi.clearAllMocks();

    replaceTerminalOutputRuntime("terminal-1", "after");
    vi.advanceTimersByTime(16);

    expect(terminal.reset).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledWith("after");
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(readTerminalOutputRuntimeSnapshot("terminal-1")).toBe("after");
  });

  it("clears mounted output and deletes runtime state cleanly", () => {
    const terminal = createTerminalRuntime();

    mountTerminalOutputRuntime({
      fallbackOutput: "cached",
      terminal,
      terminalId: "terminal-1",
    });

    vi.clearAllMocks();

    clearTerminalOutputRuntime("terminal-1");
    vi.advanceTimersByTime(16);

    expect(terminal.reset).toHaveBeenCalledTimes(1);
    expect(terminal.write).not.toHaveBeenCalled();
    expect(readTerminalOutputRuntimeSnapshot("terminal-1")).toBe("");

    unmountTerminalOutputRuntime({
      terminal,
      terminalId: "terminal-1",
    });
    deleteTerminalOutputRuntime("terminal-1");

    expect(listTerminalOutputRuntimeIds()).toEqual([]);
    expect(readTerminalOutputRuntimeSnapshot("terminal-1", "fallback")).toBe("fallback");
  });
});
