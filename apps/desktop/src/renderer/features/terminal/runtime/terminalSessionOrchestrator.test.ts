import { describe, expect, it, vi } from "vitest";
import type { TabStoreState } from "../../../store/tabStore";
import { TerminalSessionOrchestrator } from "./terminalSessionOrchestrator";

type TerminalTab = Extract<TabStoreState["tabs"][number], { kind: "terminal" }>;

/** Builds a minimal mutable tab-store facade for terminal session orchestration tests. */
function createTabStoreAccess(tab: TerminalTab | undefined) {
  const setTerminalTabSessionId = vi.fn((tabId: string, sessionId: string) => {
    if (!tab || tab.id !== tabId) {
      return;
    }

    tab.data = {
      ...tab.data,
      sessionId,
    };
  });

  return {
    getState: () => ({
      tabs: tab ? [tab] : [],
      setTerminalTabSessionId,
    }),
    setTerminalTabSessionId,
  };
}

/** Builds a minimal workspace-store facade for terminal session orchestration tests. */
function createWorkspaceStoreAccess(workspaceId: string, worktreePath: string) {
  return {
    getState: () => ({
      selectedWorkspaceId: workspaceId,
      workspaces: [
        {
          id: workspaceId,
          repoId: "repo-1",
          name: "Workspace",
          title: "Workspace",
          sourceBranch: "origin/main",
          branch: "main",
          summaryId: "summary-1",
          worktreePath,
        },
      ],
    }),
  };
}

/** Creates a terminal tab fixture with optional session and launch command. */
function createTerminalTab(
  tabId: string,
  workspaceId: string,
  sessionId?: string,
  launchCommand?: string,
): TerminalTab {
  return {
    id: tabId,
    workspaceId,
    title: "Terminal",
    pinned: false,
    kind: "terminal",
    data: {
      title: "Terminal",
      sessionId,
      launchCommand,
    },
  };
}

/** Creates one deferred promise helper for deterministic async orchestration tests. */
function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("TerminalSessionOrchestrator", () => {
  it("reuses existing session and restores buffered output", async () => {
    const tab = createTerminalTab("tab-1", "workspace-1", "session-1");
    const tabStoreAccess = createTabStoreAccess(tab);
    const commands = {
      createTerminalSession: vi.fn(),
      readTerminalOutput: vi.fn().mockResolvedValue({
        nextIndex: 3,
        chunks: ["hello ", "world"],
        exited: false,
      }),
      writeTerminalInput: vi.fn(),
      resizeTerminal: vi.fn().mockResolvedValue({ ok: true }),
    };

    const orchestrator = new TerminalSessionOrchestrator(
      commands,
      tabStoreAccess,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1"),
    );

    const terminal = {
      write: vi.fn(),
      cols: 120,
      rows: 30,
    };
    const fitAddon = { fit: vi.fn() };

    const restored = await orchestrator.attachOrCreateAndRestore({
      tabId: "tab-1",
      terminal,
      fitAddon,
    });

    expect(restored).toEqual({
      sessionId: "session-1",
      nextIndex: 3,
      exited: false,
    });
    expect(commands.createTerminalSession).not.toHaveBeenCalled();
    expect(commands.readTerminalOutput).toHaveBeenCalledWith({ sessionId: "session-1", fromIndex: 0 });
    expect(commands.resizeTerminal).toHaveBeenCalledWith({ sessionId: "session-1", cols: 120, rows: 30 });
    expect(commands.writeTerminalInput).not.toHaveBeenCalled();
    expect(fitAddon.fit).toHaveBeenCalledOnce();
    expect(terminal.write).toHaveBeenCalledWith("hello world");
    expect(tabStoreAccess.setTerminalTabSessionId).not.toHaveBeenCalled();
  });

  it("creates a new session when persisted session is missing and runs launch command", async () => {
    const tab = createTerminalTab("tab-2", "workspace-1", "stale-session", "   codex   ");
    const tabStoreAccess = createTabStoreAccess(tab);
    const commands = {
      createTerminalSession: vi.fn().mockResolvedValue({ sessionId: "new-session" }),
      readTerminalOutput: vi.fn().mockRejectedValueOnce(new Error("Terminal session not found")).mockResolvedValueOnce({
        nextIndex: 0,
        chunks: [],
        exited: false,
      }),
      writeTerminalInput: vi.fn().mockResolvedValue({ ok: true }),
      resizeTerminal: vi.fn().mockResolvedValue({ ok: true }),
    };

    const orchestrator = new TerminalSessionOrchestrator(
      commands,
      tabStoreAccess,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1"),
    );

    const restored = await orchestrator.attachOrCreateAndRestore({
      tabId: "tab-2",
      terminal: {
        write: vi.fn(),
        cols: 100,
        rows: 20,
      },
      fitAddon: { fit: vi.fn() },
    });

    expect(restored).toEqual({
      sessionId: "new-session",
      nextIndex: 0,
      exited: false,
    });
    expect(commands.createTerminalSession).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      tabId: "tab-2",
      paneId: "pane-tab-2",
    });
    expect(commands.writeTerminalInput).toHaveBeenCalledWith({
      sessionId: "new-session",
      data: "codex\r",
    });
    expect(tabStoreAccess.setTerminalTabSessionId).toHaveBeenCalledWith("tab-2", "new-session");
  });

  it("creates a replacement session when listSessions shows persisted session is gone", async () => {
    const tab = createTerminalTab("tab-2b", "workspace-1", "stale-session", "codex");
    const tabStoreAccess = createTabStoreAccess(tab);
    const commands = {
      createTerminalSession: vi.fn().mockResolvedValue({ sessionId: "new-session-2" }),
      listTerminalSessions: vi.fn().mockResolvedValue([]),
      readTerminalOutput: vi.fn().mockResolvedValue({
        nextIndex: 0,
        chunks: [],
        exited: false,
      }),
      writeTerminalInput: vi.fn().mockResolvedValue({ ok: true }),
      resizeTerminal: vi.fn().mockResolvedValue({ ok: true }),
    };

    const orchestrator = new TerminalSessionOrchestrator(
      commands,
      tabStoreAccess,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1"),
    );

    const restored = await orchestrator.attachOrCreateAndRestore({
      tabId: "tab-2b",
      terminal: {
        write: vi.fn(),
        cols: 100,
        rows: 20,
      },
      fitAddon: { fit: vi.fn() },
    });

    expect(restored).toEqual({
      sessionId: "new-session-2",
      nextIndex: 0,
      exited: false,
    });
    expect(commands.listTerminalSessions).toHaveBeenCalledWith({ includeExited: true });
    expect(commands.readTerminalOutput).toHaveBeenCalledTimes(1);
    expect(commands.readTerminalOutput).toHaveBeenCalledWith({ sessionId: "new-session-2", fromIndex: 0 });
    expect(tabStoreAccess.setTerminalTabSessionId).toHaveBeenCalledWith("tab-2b", "new-session-2");
  });

  it("reuses one exited session when includeExited lookup finds matching session id", async () => {
    const tab = createTerminalTab("tab-2c", "workspace-1", "exited-session");
    const tabStoreAccess = createTabStoreAccess(tab);
    const commands = {
      createTerminalSession: vi.fn(),
      listTerminalSessions: vi.fn().mockResolvedValue([{ sessionId: "exited-session" }]),
      readTerminalOutput: vi.fn().mockResolvedValue({
        nextIndex: 2,
        chunks: ["done"],
        exited: true,
      }),
      writeTerminalInput: vi.fn().mockResolvedValue({ ok: true }),
      resizeTerminal: vi.fn().mockResolvedValue({ ok: true }),
    };

    const orchestrator = new TerminalSessionOrchestrator(
      commands,
      tabStoreAccess,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1"),
    );

    const restored = await orchestrator.attachOrCreateAndRestore({
      tabId: "tab-2c",
      terminal: {
        write: vi.fn(),
        cols: 90,
        rows: 24,
      },
      fitAddon: { fit: vi.fn() },
    });

    expect(restored).toEqual({
      sessionId: "exited-session",
      nextIndex: 2,
      exited: true,
    });
    expect(commands.listTerminalSessions).toHaveBeenCalledWith({ includeExited: true });
    expect(commands.createTerminalSession).not.toHaveBeenCalled();
    expect(commands.readTerminalOutput).toHaveBeenCalledWith({ sessionId: "exited-session", fromIndex: 0 });
  });

  it("returns null when tab no longer exists", async () => {
    const commands = {
      createTerminalSession: vi.fn(),
      readTerminalOutput: vi.fn(),
      writeTerminalInput: vi.fn(),
      resizeTerminal: vi.fn(),
    };
    const orchestrator = new TerminalSessionOrchestrator(
      commands,
      createTabStoreAccess(undefined),
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1"),
    );

    const restored = await orchestrator.attachOrCreateAndRestore({
      tabId: "missing-tab",
      terminal: {
        write: vi.fn(),
        cols: 120,
        rows: 30,
      },
      fitAddon: { fit: vi.fn() },
    });

    expect(restored).toBeNull();
    expect(commands.readTerminalOutput).not.toHaveBeenCalled();
    expect(commands.createTerminalSession).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent session creation across orchestrator instances", async () => {
    const tab = createTerminalTab("tab-3", "workspace-1", undefined, "codex");
    const tabStoreAccess = createTabStoreAccess(tab);
    const deferredCreatedSession = createDeferred<{ sessionId: string }>();
    const commands = {
      createTerminalSession: vi.fn().mockImplementation(() => deferredCreatedSession.promise),
      readTerminalOutput: vi.fn().mockResolvedValue({
        nextIndex: 0,
        chunks: [],
        exited: false,
      }),
      writeTerminalInput: vi.fn().mockResolvedValue({ ok: true }),
      resizeTerminal: vi.fn().mockResolvedValue({ ok: true }),
    };

    const workspaceStoreAccess = createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1");
    const orchestratorA = new TerminalSessionOrchestrator(commands, tabStoreAccess, workspaceStoreAccess);
    const orchestratorB = new TerminalSessionOrchestrator(commands, tabStoreAccess, workspaceStoreAccess);

    const terminalA = {
      write: vi.fn(),
      cols: 120,
      rows: 30,
    };
    const terminalB = {
      write: vi.fn(),
      cols: 80,
      rows: 24,
    };

    const pendingA = orchestratorA.attachOrCreateAndRestore({
      tabId: "tab-3",
      terminal: terminalA,
      fitAddon: { fit: vi.fn() },
    });
    const pendingB = orchestratorB.attachOrCreateAndRestore({
      tabId: "tab-3",
      terminal: terminalB,
      fitAddon: { fit: vi.fn() },
    });

    await Promise.resolve();
    expect(commands.createTerminalSession).toHaveBeenCalledTimes(1);

    deferredCreatedSession.resolve({ sessionId: "shared-session" });

    const [restoredA, restoredB] = await Promise.all([pendingA, pendingB]);
    expect(restoredA?.sessionId).toBe("shared-session");
    expect(restoredB?.sessionId).toBe("shared-session");
    expect(commands.createTerminalSession).toHaveBeenCalledTimes(1);
    expect(commands.writeTerminalInput).toHaveBeenCalledTimes(1);
    expect(commands.writeTerminalInput).toHaveBeenCalledWith({
      sessionId: "shared-session",
      data: "codex\r",
    });
  });

  it("cleans up orphan session and throws when tab is closed during session creation", async () => {
    const tab = createTerminalTab("tab-gone", "workspace-1", undefined, "opencode");
    const tabStoreAccess = createTabStoreAccess(tab);
    const closeTerminalSession = vi.fn().mockResolvedValue(undefined);
    const deferredCreated = createDeferred<{ sessionId: string }>();
    const commands = {
      createTerminalSession: vi.fn().mockReturnValue(deferredCreated.promise),
      readTerminalOutput: vi.fn().mockResolvedValue({
        nextIndex: 0,
        chunks: [],
        exited: false,
      }),
      writeTerminalInput: vi.fn().mockResolvedValue({ ok: true }),
      resizeTerminal: vi.fn().mockResolvedValue({ ok: true }),
      closeTerminalSession,
    };

    const orchestrator = new TerminalSessionOrchestrator(
      commands,
      tabStoreAccess,
      createWorkspaceStoreAccess("workspace-1", "/tmp/workspace-1"),
    );

    const pending = orchestrator.attachOrCreateAndRestore({
      tabId: "tab-gone",
      terminal: { write: vi.fn(), cols: 80, rows: 24 },
      fitAddon: { fit: vi.fn() },
    });

    await Promise.resolve();
    expect(commands.createTerminalSession).toHaveBeenCalledTimes(1);

    tabStoreAccess.getState = () => ({
      tabs: [],
      setTerminalTabSessionId: tabStoreAccess.setTerminalTabSessionId,
    });

    deferredCreated.resolve({ sessionId: "orphan-session" });

    await expect(pending).rejects.toThrow("Terminal tab was closed before session could be attached");

    expect(closeTerminalSession).toHaveBeenCalledWith({ sessionId: "orphan-session" });
    expect(commands.readTerminalOutput).not.toHaveBeenCalled();
    expect(commands.writeTerminalInput).not.toHaveBeenCalled();
  });
});
