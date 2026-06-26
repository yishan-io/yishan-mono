// @vitest-environment jsdom
/**
 * Tests for terminal session reconnect behavior after daemon restart.
 *
 * These tests verify that when the daemon disconnects and reconnects, all
 * active (non-exited) terminal sessions are torn down and re-established
 * via resolveAndSubscribeSession.
 *
 * Strategy: mock terminalRuntimeRegistry to supply stub runtime entries
 * (no xterm DOM creation), and mock terminalCommands to track RPC calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalRuntimeEntry } from "./terminalRuntimeRegistry";

// ─── Module Mocks ────────────────────────────────────────────────────────────

// Capture the daemon connection status listener registered by terminalSessionService.
let capturedConnectionStatusListener: ((status: string) => void) | null = null;

vi.mock("../../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: (listener: (status: string) => void) => {
    capturedConnectionStatusListener = listener;
    return () => {};
  },
}));

// Stub active runtimes list returned to reconnectAllTerminalSessions.
let stubActiveRuntimes: TerminalRuntimeEntry[] = [];

vi.mock("./terminalRuntimeRegistry", () => ({
  ensureTerminalRuntime: vi.fn(),
  getActiveTerminalRuntimes: () => stubActiveRuntimes,
  getTerminalRuntime: vi.fn((tabId: string) => stubActiveRuntimes.find((r) => r.tabId === tabId) ?? null),
  reportTerminalAsyncError: vi.fn(),
  setTerminalDisposeHandler: vi.fn(),
  setTerminalOutputSubscription: vi.fn((tabId: string, sub: { unsubscribe: () => void } | null) => {
    const entry = stubActiveRuntimes.find((r) => r.tabId === tabId);
    if (entry) {
      entry.outputSubscription = sub;
    }
  }),
  setTerminalReattachHandler: vi.fn(),
  setTerminalResizeHandler: vi.fn(),
  setTerminalSessionId: vi.fn((tabId: string, sessionId: string) => {
    const entry = stubActiveRuntimes.find((r) => r.tabId === tabId);
    if (entry) {
      entry.sessionId = sessionId;
    }
  }),
  updateTerminalReadIndex: vi.fn(),
}));

// Mock terminal commands to track calls and control return values.
const mockCreateTerminalSession = vi.fn();
const mockListTerminalSessions = vi.fn();
const mockReadTerminalOutput = vi.fn();
const mockResizeTerminal = vi.fn();
const mockSubscribeTerminalOutput = vi.fn();
const mockWriteTerminalInput = vi.fn();
const mockCloseTerminalSession = vi.fn();

vi.mock("../../../commands/terminalCommands", () => ({
  createTerminalSession: (...args: unknown[]) => mockCreateTerminalSession(...args),
  listTerminalSessions: (...args: unknown[]) => mockListTerminalSessions(...args),
  readTerminalOutput: (...args: unknown[]) => mockReadTerminalOutput(...args),
  resizeTerminal: (...args: unknown[]) => mockResizeTerminal(...args),
  subscribeTerminalOutput: (...args: unknown[]) => mockSubscribeTerminalOutput(...args),
  writeTerminalInput: (...args: unknown[]) => mockWriteTerminalInput(...args),
  closeTerminalSession: (...args: unknown[]) => mockCloseTerminalSession(...args),
}));

vi.mock("../../../commands/tabCommands", () => ({
  closeTab: vi.fn(),
  renameTab: vi.fn(),
}));

const mockEnqueueWorkspaceErrorNotice = vi.fn();
const mockTabStoreCloseTab = vi.fn();

vi.mock("../../../store/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: (...args: unknown[]) => mockEnqueueWorkspaceErrorNotice(...args),
}));

vi.mock("./terminalSessionOrchestrator", async (importOriginal) => {
  const original = await importOriginal<typeof import("./terminalSessionOrchestrator")>();
  return original;
});

vi.mock("./terminalTitleUtils", () => ({
  formatTerminalCommandTitle: vi.fn(() => ""),
  formatTerminalPathTitle: vi.fn(() => ""),
  resolveTerminalWorkspacePath: vi.fn(() => undefined),
}));

vi.mock("../../../store/tabStore", () => ({
  tabStore: {
    getState: () => ({
      // Each test sets sessionIdByTabId before simulating reconnect so the tabStore
      // mock can return the pre-restart (stale) session ID that was persisted before restart.
      tabs: sessionIdByTabId
        ? Object.entries(sessionIdByTabId).map(([tabId, sessionId]) => ({
            id: tabId,
            kind: "terminal",
            workspaceId: "ws-1",
            title: "Terminal",
            pinned: false,
            data: { sessionId },
          }))
        : [],
      setTerminalTabSessionId: vi.fn(),
      closeTab: (...args: unknown[]) => mockTabStoreCloseTab(...args),
    }),
  },
}));

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: {
    getState: () => ({
      workspaces: [{ id: "ws-1", worktreePath: "/tmp/ws" }],
    }),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

await import("./terminalSessionService");
const { __resetTerminalSessionServiceForTests } = await import("./terminalSessionService");

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Stores pre-restart session IDs as the tabStore would persist them.
// Updated by tests that need the orchestrator to see a stale session ID.
let sessionIdByTabId: Record<string, string | undefined> = {};

function buildNewSessionSnapshot() {
  return { nextIndex: 0, chunks: [], exited: false };
}

function buildOutputSubscription() {
  return { unsubscribe: vi.fn() };
}

function buildStubRuntime(tabId: string, overrides?: Partial<TerminalRuntimeEntry>): TerminalRuntimeEntry {
  return {
    tabId,
    state: "attached",
    version: 1,
    terminal: {
      cols: 120,
      rows: 30,
      write: vi.fn(),
      reset: vi.fn(),
      onData: vi.fn(),
      onTitleChange: vi.fn(),
      attachCustomKeyEventHandler: vi.fn(),
      paste: vi.fn(),
      clear: vi.fn(),
    } as unknown as TerminalRuntimeEntry["terminal"],
    hostElement: document.createElement("div"),
    fitAddon: { fit: vi.fn() } as unknown as TerminalRuntimeEntry["fitAddon"],
    searchAddon: {} as unknown as TerminalRuntimeEntry["searchAddon"],
    writeQueue: {
      enqueue: vi.fn(),
      setDetached: vi.fn(),
      dispose: vi.fn(),
    } as unknown as TerminalRuntimeEntry["writeQueue"],
    sessionId: null,
    outputSubscription: null,
    readIndex: 0,
    didRequestClose: false,
    resizeObserver: null,
    focusObserver: null,
    exited: false,
    lastReportedCols: -1,
    lastReportedRows: -1,
    lastFitAt: 0,
    pendingFocus: false,
    ...overrides,
  };
}

/** Simulates daemon disconnect then reconnect by calling the captured listener. */
function simulateDaemonRestart() {
  capturedConnectionStatusListener?.("disconnected");
  capturedConnectionStatusListener?.("connected");
}

// ─── Test setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stubActiveRuntimes = [];
  sessionIdByTabId = {};
  __resetTerminalSessionServiceForTests?.();
});

afterEach(() => {
  stubActiveRuntimes = [];
  sessionIdByTabId = {};
  __resetTerminalSessionServiceForTests?.();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("terminal session reconnect after daemon restart", () => {
  it("reconnect listener is registered at module load time", () => {
    expect(capturedConnectionStatusListener).toBeTypeOf("function");
  });

  it("does not reconnect on first connected event (no prior disconnect)", async () => {
    const entry = buildStubRuntime("tab-no-disconnect", { sessionId: "existing-session" });
    stubActiveRuntimes = [entry];

    // Fire "connected" without a prior "disconnected" — should be a no-op.
    capturedConnectionStatusListener?.("connected");
    await Promise.resolve();

    expect(mockCreateTerminalSession).not.toHaveBeenCalled();
    expect(mockListTerminalSessions).not.toHaveBeenCalled();
  });

  it("clears session id and re-creates session for active runtimes on reconnect", async () => {
    const oldSubscription = buildOutputSubscription();

    mockListTerminalSessions.mockResolvedValue([]);
    mockCreateTerminalSession.mockResolvedValue({ sessionId: "new-session-1" });
    mockReadTerminalOutput.mockResolvedValue(buildNewSessionSnapshot());
    mockResizeTerminal.mockResolvedValue({ ok: true });
    mockSubscribeTerminalOutput.mockResolvedValue(buildOutputSubscription());

    const entry = buildStubRuntime("tab-reconnect-1", {
      sessionId: "old-session-1",
      readIndex: 5,
      outputSubscription: oldSubscription,
    });
    stubActiveRuntimes = [entry];
    // Simulate the tabStore still holding the pre-restart session ID.
    sessionIdByTabId = { "tab-reconnect-1": "old-session-1" };

    simulateDaemonRestart();
    await new Promise((r) => setTimeout(r, 0));

    // Old subscription should be torn down.
    expect(oldSubscription.unsubscribe).toHaveBeenCalledOnce();

    // Terminal buffer should be reset before the new session output is written.
    expect(entry.terminal.reset).toHaveBeenCalledOnce();

    // New session should be created since listSessions returns empty (daemon restarted).
    expect(mockListTerminalSessions).toHaveBeenCalledWith({ includeExited: true });
    expect(mockCreateTerminalSession).toHaveBeenCalledOnce();
  });

  it("skips runtimes that have already exited", async () => {
    const entry = buildStubRuntime("tab-exited", {
      sessionId: "exited-session",
      exited: true,
      outputSubscription: buildOutputSubscription(),
    });
    stubActiveRuntimes = [entry];

    simulateDaemonRestart();
    await Promise.resolve();

    expect(mockCreateTerminalSession).not.toHaveBeenCalled();
    expect(mockListTerminalSessions).not.toHaveBeenCalled();
  });

  it("skips runtimes that have already requested close", async () => {
    const entry = buildStubRuntime("tab-closing", {
      sessionId: "closing-session",
      didRequestClose: true,
      outputSubscription: buildOutputSubscription(),
    });
    stubActiveRuntimes = [entry];

    simulateDaemonRestart();
    await Promise.resolve();

    expect(mockCreateTerminalSession).not.toHaveBeenCalled();
    expect(mockListTerminalSessions).not.toHaveBeenCalled();
  });

  it("reconnects multiple active sessions independently", async () => {
    const sub1 = buildOutputSubscription();
    const sub2 = buildOutputSubscription();

    mockListTerminalSessions.mockResolvedValue([]);
    mockCreateTerminalSession
      .mockResolvedValueOnce({ sessionId: "new-session-a" })
      .mockResolvedValueOnce({ sessionId: "new-session-b" });
    mockReadTerminalOutput.mockResolvedValue(buildNewSessionSnapshot());
    mockResizeTerminal.mockResolvedValue({ ok: true });
    mockSubscribeTerminalOutput.mockResolvedValue(buildOutputSubscription());

    stubActiveRuntimes = [
      buildStubRuntime("tab-multi-a", { sessionId: "old-a", outputSubscription: sub1 }),
      buildStubRuntime("tab-multi-b", { sessionId: "old-b", outputSubscription: sub2 }),
    ];
    sessionIdByTabId = { "tab-multi-a": "old-a", "tab-multi-b": "old-b" };

    simulateDaemonRestart();
    await new Promise((r) => setTimeout(r, 0));

    expect(sub1.unsubscribe).toHaveBeenCalledOnce();
    expect(sub2.unsubscribe).toHaveBeenCalledOnce();
    expect(mockCreateTerminalSession).toHaveBeenCalledTimes(2);
  });

  it("does not reconnect on second connected event if no new disconnect occurred", async () => {
    const sub = buildOutputSubscription();

    mockListTerminalSessions.mockResolvedValue([]);
    mockCreateTerminalSession.mockResolvedValue({ sessionId: "session-after-reconnect" });
    mockReadTerminalOutput.mockResolvedValue(buildNewSessionSnapshot());
    mockResizeTerminal.mockResolvedValue({ ok: true });
    mockSubscribeTerminalOutput.mockResolvedValue(buildOutputSubscription());

    const entry = buildStubRuntime("tab-double-connected", {
      sessionId: "old-session",
      outputSubscription: sub,
    });
    stubActiveRuntimes = [entry];
    sessionIdByTabId = { "tab-double-connected": "old-session" };

    // First reconnect.
    simulateDaemonRestart();
    await new Promise((r) => setTimeout(r, 0));

    expect(sub.unsubscribe).toHaveBeenCalledOnce();
    expect(mockCreateTerminalSession).toHaveBeenCalledTimes(1);

    // Second "connected" without a disconnect in between should not reconnect again.
    capturedConnectionStatusListener?.("connected");
    await Promise.resolve();

    expect(mockCreateTerminalSession).toHaveBeenCalledTimes(1);
  });

  it("surfaces error notice and closes tab when session creation fails", async () => {
    mockListTerminalSessions.mockResolvedValue([]);
    mockCreateTerminalSession.mockRejectedValue(new Error("workspace not found"));

    const entry = buildStubRuntime("tab-fail", {
      sessionId: "old-fail-session",
      outputSubscription: buildOutputSubscription(),
    });
    stubActiveRuntimes = [entry];
    sessionIdByTabId = { "tab-fail": "old-fail-session" };

    simulateDaemonRestart();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockEnqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
      title: "Failed to create terminal session",
      message: "workspace not found",
    });
    expect(mockTabStoreCloseTab).toHaveBeenCalledWith("tab-fail");
  });
});
