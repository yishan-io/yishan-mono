// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../features/workbench/state/splitPaneStore";
import { tabStore } from "../../../features/workbench/state/tabStore";
import { sendAgentPrompt } from "../commands/agentChatCommands";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "../events/agentChatEventRouter";
import { handleAgentPiEvent } from "../events/agentChatPiEventHandler";
import { registerAgentSession } from "../events/agentChatPiEventShared";
import { agentChatStore } from "../model/agentChatStore";
import { clearPiSessionHandle, ensurePiSession, stopPiSession } from "./agentSessionRuntime";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
  listActiveSessions: vi.fn(),
}));

vi.mock("../../../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../events/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
  getDaemonClient: vi.fn(async () => ({
    pi: {
      start: mocks.start,
      attach: mocks.attach,
      stop: mocks.stop,
      send: mocks.send,
      listSessions: mocks.listSessions,
      listActiveSessions: mocks.listActiveSessions,
    },
  })),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  // The reopen test leaves a deferred pi.stop implementation behind; reset it so
  // later tests never hang on an unresolved stop.
  mocks.stop.mockReset();
  vi.clearAllMocks();
});
describe("agentSessionRuntime.ensurePiSession", () => {
  it("passes paneId through to pi.start", async () => {
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-1",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-pane-explicit",
      sessionId: "generated-session-id",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "generated-session-id",
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-1",
      resume: undefined,
    });
  });

  it("uses a deterministic pane fallback when paneId is omitted", async () => {
    mocks.start.mockResolvedValue({ sessionId: "pi-session-2" });

    await ensurePiSession({
      tabId: "tab-pane-fallback",
      workspaceId: "workspace-2",
      cwd: "/tmp/project-2",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-pane-fallback",
      sessionId: "generated-session-id",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "generated-session-id",
      tabId: "tab-pane-fallback",
      workspaceId: "workspace-2",
      cwd: "/tmp/project-2",
      paneId: "pane-tab-pane-fallback",
      resume: undefined,
    });
  });

  it("reopens history sessions by starting with the existing session id", async () => {
    mocks.start.mockResolvedValue({ sessionId: "history-session-1" });

    await ensurePiSession({
      tabId: "tab-history-resume",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-session-1",
      paneId: "pane-history",
    });
    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-history-resume",
      sessionId: "history-session-1",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "history-session-1",
      tabId: "tab-history-resume",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-history",
      resume: undefined,
    });
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("attaches only when start reports that the live daemon session already exists", async () => {
    mocks.start.mockRejectedValue(Object.assign(new Error("agent session already exists"), { code: -32003 }));
    mocks.attach.mockResolvedValue({ ok: true });

    await ensurePiSession({
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "live-session-1",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-reattach",
      sessionId: "live-session-1",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "live-session-1",
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-tab-reattach",
      resume: undefined,
    });
    expect(mocks.attach).toHaveBeenCalledWith({
      sessionId: "live-session-1",
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
  });

  it("does not attach when start fails for reasons other than an already-running live session", async () => {
    mocks.start.mockRejectedValue(new Error("pi session not found"));

    await expect(
      ensurePiSession({
        tabId: "tab-start-failure",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "missing-session-1",
      }),
    ).rejects.toThrow("pi session not found");

    expect(mocks.attach).not.toHaveBeenCalled();
    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-start-failure",
      sessionId: "missing-session-1",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();
  });

  it("prefers explicit session ids over stale local chat-session state", async () => {
    agentChatStore.getState().initSession("tab-explicit-live", "stale-session");
    mocks.start.mockResolvedValue({ sessionId: "live-session-2" });

    await ensurePiSession({
      tabId: "tab-explicit-live",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "live-session-2",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-explicit-live",
      sessionId: "live-session-2",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "live-session-2",
      tabId: "tab-explicit-live",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-tab-explicit-live",
      resume: undefined,
    });
  });

  it("clears the previous turn error when sending a new prompt", async () => {
    agentChatStore.getState().initSession("tab-send", "session-send");
    agentChatStore.getState().setTurnError("tab-send", "previous turn failed");

    await sendAgentPrompt({
      tabId: "tab-send",
      sessionId: "session-send",
      message: "try again",
    });

    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-send",
      command: {
        type: "prompt",
        message: "try again",
        streamingBehavior: undefined,
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-send"]?.turnError).toBeNull();
  });

  it("unsubscribes and still stops the backend session after clearing a stale local handle", async () => {
    const unsubscribe = vi.fn();
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-clear-handle",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
    registerAgentSession({ tabId: "tab-clear-handle", sessionId: "generated-session-id" });

    clearPiSessionHandle("tab-clear-handle");
    await stopPiSession("tab-clear-handle");

    expect(mocks.stop).toHaveBeenCalledWith({ sessionId: "generated-session-id" });
  });

  it("stops a Pi session even when the tab closes while pi.start is still in flight", async () => {
    let resolveStart: ((value: { sessionId: string }) => void) | undefined;
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve: (value: { sessionId: string }) => void) => {
          resolveStart = resolve;
        }),
    );

    const ensurePromise = ensurePiSession({
      tabId: "tab-close-during-start",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    await Promise.resolve();

    const stopPromise = stopPiSession("tab-close-during-start");
    expect(mocks.stop).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mocks.start).toHaveBeenCalled();
    });
    resolveStart?.({ sessionId: "generated-session-id" });

    await ensurePromise;
    await stopPromise;

    expect(mocks.stop).toHaveBeenCalledWith({ sessionId: "generated-session-id" });
  });

  it("concurrent ensurePiSession calls await in-flight startup and return the same session ID", async () => {
    let resolveStart: ((value: { sessionId: string }) => void) | undefined;
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve: (value: { sessionId: string }) => void) => {
          resolveStart = resolve;
        }),
    );

    // First call starts Pi but hasn't resolved yet.
    const firstPromise = ensurePiSession({
      tabId: "tab-concurrent",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    // Yield to let the first call register its handle before the second starts.
    await Promise.resolve();

    // Second call (simulates Strict Mode remount) finds the in-flight handle.
    const secondPromise = ensurePiSession({
      tabId: "tab-concurrent",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    // Pi hasn't started yet — second call must be waiting, not resolved.
    let secondResolved = false;
    void secondPromise.then(() => {
      secondResolved = true;
    });
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    // Resolve Pi startup.
    await vi.waitFor(() => {
      expect(mocks.start).toHaveBeenCalled();
    });
    resolveStart?.({ sessionId: "generated-session-id" });

    const [id1, id2] = await Promise.all([firstPromise, secondPromise]);

    expect(id1.sessionId).toBe("generated-session-id");
    expect(id2.sessionId).toBe("generated-session-id");
    expect(id1.attached).toBe(false);
    // Pi must have been started only once.
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("reopens a session id only after an in-flight stop for it has settled", async () => {
    mocks.start.mockResolvedValue({ sessionId: "history-close-reopen" });

    // Open the history session in a first tab.
    await ensurePiSession({
      tabId: "tab-close",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-close-reopen",
    });

    // Close the tab; pi.stop stays in flight until the test resolves it.
    let resolveStop: (() => void) | undefined;
    mocks.stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        }),
    );
    const stopPromise = stopPiSession("tab-close");
    await vi.waitFor(() => {
      expect(mocks.stop).toHaveBeenCalledWith({ sessionId: "history-close-reopen" });
    });

    // Reopen the same history session in a new tab while the stop is in flight.
    const reopenPromise = ensurePiSession({
      tabId: "tab-reopen",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-close-reopen",
    });

    // The reopen must wait for the teardown instead of racing pi.start.
    let reopenSettled = false;
    void reopenPromise.then(() => {
      reopenSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(reopenSettled).toBe(false);
    expect(mocks.start).toHaveBeenCalledTimes(1); // only the first open so far

    // Finish the teardown; the reopen then proceeds with a fresh pi.start.
    resolveStop?.();
    await stopPromise;
    await reopenPromise;

    expect(reopenSettled).toBe(true);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionId: "history-close-reopen", tabId: "tab-reopen" }),
    );
  });

  it("closes subagent-detail tabs without stopping the child session", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "subagent-tab",
            workspaceId: "workspace-1",
            title: "Builder detail",
            pinned: false,
            kind: "agent-chat",
            data: {
              cwd: "/tmp/project",
              sessionId: "child-session-1",
              sessionView: "subagent-detail",
            },
          },
        ],
      },
      true,
    );
    agentChatStore.getState().initSession("subagent-tab", "child-session-1");

    await stopPiSession("subagent-tab");

    expect(mocks.stop).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]).toBeUndefined();
  });
});
