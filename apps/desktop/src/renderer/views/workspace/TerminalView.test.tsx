// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalView } from "./TerminalView";

type TerminalOutputEvent =
  | { type: "output"; sessionId: string; chunk: string; nextIndex: number }
  | { type: "exit"; sessionId: string; exitCode: number | null; signalCode: string | number | null };

const mocked = vi.hoisted(() => {
  const stateRef: { current: Record<string, unknown> } = {
    current: {},
  };
  const subscriptions = new Map<string, { onData: (event: TerminalOutputEvent) => void }>();
  const workspaceStore = Object.assign(
    vi.fn((selector: (state: Record<string, unknown>) => unknown) => selector(stateRef.current)),
    {
      getState: () => stateRef.current,
    },
  );
  const tabStore = Object.assign(
    vi.fn((selector: (state: Record<string, unknown>) => unknown) => selector(stateRef.current)),
    {
      setState: (
        updater:
          | Record<string, unknown>
          | ((state: Record<string, unknown>) => Record<string, unknown> | Partial<Record<string, unknown>>),
      ) => {
        const patch = typeof updater === "function" ? updater(stateRef.current) : updater;
        stateRef.current = {
          ...stateRef.current,
          ...patch,
        };
      },
      getState: () => stateRef.current,
      subscribe: vi.fn(() => () => {}),
    },
  );
  const createTerminalSession = vi.fn();
  const listTerminalSessions = vi.fn().mockResolvedValue([]);
  const readTerminalOutput = vi.fn();
  const resizeTerminal = vi.fn();
  const subscribeTerminalOutput = vi.fn(
    async (input: {
      sessionId: string;
      onData: (event: TerminalOutputEvent) => void;
    }) => {
      subscriptions.set(input.sessionId, { onData: input.onData });
      return {
        unsubscribe: () => {
          subscriptions.delete(input.sessionId);
        },
      };
    },
  );
  const writeTerminalInput = vi.fn().mockResolvedValue({ ok: true });
  const xtermFocus = vi.fn();
  const xtermClear = vi.fn();
  const closeTab = vi.fn((tabId: string) => {
    const state = stateRef.current as { closeTab?: (nextTabId: string) => void };
    state.closeTab?.(tabId);
  });
  const searchAddon = {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
    clearActiveDecoration: vi.fn(),
  };
  let terminalCustomKeyEventHandler: ((event: KeyboardEvent) => boolean) | undefined;
  const loadTerminalAddons = vi.fn(() => ({
    fitAddon: {
      fit() {},
    },
    searchAddon,
  }));

  return {
    stateRef,
    workspaceStore,
    tabStore,
    createTerminalSession,
    listTerminalSessions,
    readTerminalOutput,
    resizeTerminal,
    subscribeTerminalOutput,
    writeTerminalInput,
    xtermFocus,
    xtermClear,
    closeTab,
    searchAddon,
    loadTerminalAddons,
    setTerminalCustomKeyEventHandler: (handler: ((event: KeyboardEvent) => boolean) | undefined) => {
      terminalCustomKeyEventHandler = handler;
    },
    dispatchTerminalKeyEvent: (type: "keydown" | "keypress" | "keyup", input: KeyboardEventInit) =>
      terminalCustomKeyEventHandler?.(new KeyboardEvent(type, input)),
    emitTerminalEvent: (sessionId: string, event: TerminalOutputEvent) => {
      subscriptions.get(sessionId)?.onData(event);
    },
  };
});

vi.mock("../../store/workspaceStore", () => ({
  workspaceStore: mocked.workspaceStore,
}));

vi.mock("../../store/tabStore", () => ({
  tabStore: mocked.tabStore,
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => ({
    closeTab: mocked.closeTab,
    createTerminalSession: mocked.createTerminalSession,
    listTerminalSessions: mocked.listTerminalSessions,
    readTerminalOutput: mocked.readTerminalOutput,
    resizeTerminal: mocked.resizeTerminal,
    subscribeTerminalOutput: mocked.subscribeTerminalOutput,
    writeTerminalInput: mocked.writeTerminalInput,
  }),
}));

vi.mock("@xterm/xterm", () => {
  class FakeTerminal {
    cols = 120;
    rows = 30;
    private onDataHandler: ((data: string) => void) | undefined;

    open() {}
    reset() {}
    clear() {
      mocked.xtermClear();
    }
    writeln() {}
    write() {}
    paste(data: string) {
      this.onDataHandler?.(data);
    }
    dispose() {}
    focus() {
      mocked.xtermFocus();
    }
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      mocked.setTerminalCustomKeyEventHandler(handler);
    }
    onData(handler: (data: string) => void) {
      this.onDataHandler = handler;
      return {
        dispose: () => {
          this.onDataHandler = undefined;
        },
      };
    }
  }

  return {
    Terminal: FakeTerminal,
  };
});

vi.mock("./terminalAddons", () => ({
  loadTerminalAddons: mocked.loadTerminalAddons,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocked.setTerminalCustomKeyEventHandler(undefined);
  vi.clearAllMocks();
});

/** Builds the minimal workspace-store state required by TerminalView. */
function buildStoreState() {
  const state: {
    tabs: Array<{
      id: string;
      workspaceId: string;
      title: string;
      pinned: boolean;
      kind: "terminal";
      data: {
        title: string;
        launchCommand?: string;
        sessionId?: string;
      };
    }>;
    workspaces: Array<{
      id: string;
      name: string;
      title: string;
      sourceBranch: string;
      branch: string;
      summaryId: string;
      repoId: string;
      worktreePath: string;
    }>;
    closeTab: ReturnType<typeof vi.fn>;
    setTerminalTabSessionId: (tabId: string, sessionId: string) => void;
  } = {
    tabs: [
      {
        id: "terminal-tab-1",
        workspaceId: "workspace-1",
        title: "Terminal",
        pinned: false,
        kind: "terminal",
        data: {
          title: "Terminal",
        },
      },
    ],
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace 1",
        title: "Workspace 1",
        sourceBranch: "origin/main",
        branch: "main",
        summaryId: "summary-1",
        repoId: "repo-1",
        worktreePath: "/tmp/workspace-1",
      },
    ],
    closeTab: vi.fn(),
    setTerminalTabSessionId: (tabId: string, sessionId: string) => {
      state.tabs = state.tabs.map((tab) =>
        tab.id === tabId && tab.kind === "terminal"
          ? {
              ...tab,
              data: {
                ...tab.data,
                sessionId,
              },
            }
          : tab,
      );
    },
  };

  return state;
}

describe("TerminalView", () => {
  it("closes tab when websocket reports session exited", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-1",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    render(<TerminalView tabId="terminal-tab-1" />);
    await waitFor(() => {
      expect(mocked.createTerminalSession).toHaveBeenCalledWith({
        cwd: "/tmp/workspace-1",
        workspaceId: "workspace-1",
        tabId: "terminal-tab-1",
        paneId: "pane-terminal-tab-1",
      });
    });
    await waitFor(() => {
      expect(mocked.subscribeTerminalOutput).toHaveBeenCalled();
    });

    mocked.emitTerminalEvent("session-1", {
      type: "exit",
      sessionId: "session-1",
      exitCode: 0,
      signalCode: null,
    });

    expect(state.closeTab).toHaveBeenCalledWith("terminal-tab-1");
  });

  it("prefixes launch command with exec for new sessions", async () => {
    const state = buildStoreState();
    state.tabs = [
      {
        id: "terminal-tab-2",
        workspaceId: "workspace-1",
        title: "Codex",
        pinned: false,
        kind: "terminal",
        data: {
          title: "Codex",
          launchCommand: "codex",
        },
      },
    ];
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-2",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    render(<TerminalView tabId="terminal-tab-2" />);
    await waitFor(() => {
      expect(mocked.writeTerminalInput).toHaveBeenCalledWith({
        sessionId: "session-2",
        data: "exec codex\r",
      });
    });
  });

  it("does not close tab when attach resolves after unmount", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;

    let resolveCreate: ((value: { sessionId: string; cwd: string; cols: number; rows: number }) => void) | undefined;
    const createPromise = new Promise<{ sessionId: string; cwd: string; cols: number; rows: number }>((resolve) => {
      resolveCreate = resolve;
    });
    mocked.createTerminalSession.mockReturnValueOnce(createPromise);
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: true,
      exitCode: 0,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    const view = render(<TerminalView tabId="terminal-tab-1" />);
    await waitFor(() => {
      expect(mocked.createTerminalSession).toHaveBeenCalled();
    });

    view.unmount();
    resolveCreate?.({
      sessionId: "session-after-unmount",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(state.closeTab).not.toHaveBeenCalled();
  });

  it("handles attach errors without unhandled rejection", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    const attachError = new Error("attach failed");
    mocked.createTerminalSession.mockRejectedValueOnce(attachError);

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<TerminalView tabId="terminal-tab-1" />);
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("[TerminalView] Failed to attach terminal session", attachError);
    });

    errorSpy.mockRestore();
  });

  it("opens terminal search, navigates matches, and clears highlights", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-search-1",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    const view = render(<TerminalView tabId="terminal-tab-1" />);
    const host = view.container.firstElementChild as HTMLElement;
    fireEvent.keyDown(host, { key: "f", ctrlKey: true });

    const searchInput = await screen.findByLabelText("Search terminal output");
    fireEvent.change(searchInput, { target: { value: "error" } });

    await waitFor(() => {
      expect(mocked.searchAddon.findNext).toHaveBeenCalledWith("error", {
        caseSensitive: false,
        regex: false,
        wholeWord: false,
        incremental: true,
      });
    });

    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(mocked.searchAddon.findNext).toHaveBeenLastCalledWith("error", {
      caseSensitive: false,
      regex: false,
      wholeWord: false,
      incremental: true,
    });

    fireEvent.keyDown(searchInput, { key: "Enter", shiftKey: true });
    expect(mocked.searchAddon.findPrevious).toHaveBeenCalledWith("error", {
      caseSensitive: false,
      regex: false,
      wholeWord: false,
      incremental: true,
    });

    fireEvent.keyDown(searchInput, { key: "Escape" });
    expect(mocked.searchAddon.clearDecorations).toHaveBeenCalled();
    expect(mocked.searchAddon.clearActiveDecoration).toHaveBeenCalled();
    expect(screen.queryByLabelText("Search terminal output")).toBeNull();
  });

  it("focuses xterm when requested", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-focus",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const view = render(<TerminalView tabId="terminal-tab-1" focusRequestKey={0} />);
    expect(mocked.xtermFocus).not.toHaveBeenCalled();

    view.rerender(<TerminalView tabId="terminal-tab-1" focusRequestKey={1} />);

    expect(mocked.xtermFocus).toHaveBeenCalledTimes(1);
  });

  it("releases macOS Cmd+W from terminal key handling for renderer tab close", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-mac-close",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");

    render(<TerminalView tabId="terminal-tab-1" />);
    await waitFor(() => {
      expect(mocked.createTerminalSession).toHaveBeenCalled();
    });

    const handled = mocked.dispatchTerminalKeyEvent("keydown", { key: "w", metaKey: true });
    expect(handled).toBe(false);
  });

  it("keeps Ctrl+W handled by terminal key forwarding", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-ctrl-w",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    render(<TerminalView tabId="terminal-tab-1" />);
    await waitFor(() => {
      expect(mocked.createTerminalSession).toHaveBeenCalled();
    });

    const handled = mocked.dispatchTerminalKeyEvent("keydown", { key: "w", ctrlKey: true });
    expect(handled).toBe(true);
  });

  it("clears terminal output for macOS Cmd+K without closing the session", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-cmd-k",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");

    render(<TerminalView tabId="terminal-tab-1" />);
    await waitFor(() => {
      expect(mocked.createTerminalSession).toHaveBeenCalled();
    });

    const handled = mocked.dispatchTerminalKeyEvent("keydown", { key: "k", metaKey: true });

    expect(handled).toBe(false);
    expect(mocked.xtermClear).toHaveBeenCalledTimes(1);
    expect(mocked.writeTerminalInput).not.toHaveBeenCalled();
    expect(mocked.closeTab).not.toHaveBeenCalled();
  });

  it("forwards Shift+Enter as line feed input for multiline agent composition", async () => {
    const state = buildStoreState();
    mocked.stateRef.current = state;
    mocked.createTerminalSession.mockResolvedValueOnce({
      sessionId: "session-shift-enter",
      cwd: "/tmp/workspace-1",
      cols: 120,
      rows: 30,
    });
    mocked.readTerminalOutput.mockResolvedValueOnce({
      nextIndex: 0,
      chunks: [],
      exited: false,
      exitCode: null,
      signalCode: null,
    });
    mocked.resizeTerminal.mockResolvedValue({ ok: true });

    class MockResizeObserver {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    render(<TerminalView tabId="terminal-tab-1" />);
    await waitFor(() => {
      expect(mocked.createTerminalSession).toHaveBeenCalled();
    });

    const handled = mocked.dispatchTerminalKeyEvent("keydown", { key: "Enter", shiftKey: true });
    expect(handled).toBe(false);
    await waitFor(() => {
      expect(mocked.writeTerminalInput).toHaveBeenCalledWith({
        sessionId: "session-shift-enter",
        data: "\n",
      });
    });

    const secondHandled = mocked.dispatchTerminalKeyEvent("keydown", { key: "Enter", shiftKey: true });
    expect(secondHandled).toBe(false);
    await waitFor(() => {
      expect(mocked.writeTerminalInput).toHaveBeenCalledTimes(2);
    });

    const keypressHandled = mocked.dispatchTerminalKeyEvent("keypress", { key: "Enter", shiftKey: true });
    const keyupHandled = mocked.dispatchTerminalKeyEvent("keyup", { key: "Enter", shiftKey: true });

    expect(keypressHandled).toBe(false);
    expect(keyupHandled).toBe(false);
    expect(mocked.writeTerminalInput).toHaveBeenCalledTimes(2);
  });
});
