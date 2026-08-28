// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { agentChatStore } from "../state/agentChatStore";
import { registerAgentSession } from "../subscriptions/agentChatPiEventShared";
import { clearPiSessionHandle, ensurePiSession, stopPiSession } from "./agentSessionRuntime";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();

const mocks = vi.hoisted(() => ({
  startAgent: vi.fn(),
  attachAgent: vi.fn(),
  promptAgent: vi.fn(),
  abortAgent: vi.fn(),
  disposeAgent: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
  listActiveSessions: vi.fn(),
  getSessionFile: vi.fn(),
  listModels: vi.fn(),
  listProviders: vi.fn(),
  removeProvider: vi.fn(),
  rename: vi.fn(),
  runChatPrompt: vi.fn(),
  saveProvider: vi.fn(),
  closeAgentSession: vi.fn(),
  ensureChatSession: vi.fn(),
  getDetectionStatuses: vi.fn(),
  listDetectionStatuses: vi.fn(),
}));

vi.mock("@shared/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
  attachAgentSession: mocks.attachAgent,
  abortAgentSession: mocks.abortAgent,
  disposeAgentSession: mocks.disposeAgent,
  promptAgentSession: mocks.promptAgent,
  startAgentSession: mocks.startAgent,
  closeAgentSession: mocks.closeAgentSession ?? vi.fn(),
  ensureWorkspaceChatSession: mocks.ensureChatSession ?? vi.fn(),
  listActivePiCompatibilitySessions: mocks.listActiveSessions ?? vi.fn(),
  listAgentDetectionStatuses: mocks.listDetectionStatuses ?? vi.fn(),
  listAgentModels: mocks.listModels ?? vi.fn(),
  listPiProviders: mocks.listProviders ?? vi.fn(),
  removePiProvider: mocks.removeProvider ?? vi.fn(),
  renamePiCompatibilitySession: mocks.rename ?? vi.fn(),
  runWorkspaceChatPrompt: mocks.runChatPrompt ?? vi.fn(),
  savePiProvider: mocks.saveProvider ?? vi.fn(),
  sendPiCompatibilityCommand: mocks.send ?? vi.fn(),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  mocks.disposeAgent.mockReset();
  vi.clearAllMocks();
});
describe("agentSessionRuntime.stopPiSession", () => {
  it("unsubscribes and still stops the backend session after clearing a stale local handle", async () => {
    mocks.startAgent.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-clear-handle",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
    registerAgentSession({ tabId: "tab-clear-handle", sessionId: "generated-session-id" });

    clearPiSessionHandle("tab-clear-handle");
    await stopPiSession("tab-clear-handle");

    expect(mocks.disposeAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "generated-session-id",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
  });

  it("stops a Pi session even when the tab closes while pi.start is still in flight", async () => {
    let resolveStart: ((value: { sessionId: string }) => void) | undefined;
    mocks.startAgent.mockImplementation(
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
    expect(mocks.disposeAgent).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mocks.startAgent).toHaveBeenCalled();
    });
    resolveStart?.({ sessionId: "generated-session-id" });

    await ensurePromise;
    await stopPromise;

    expect(mocks.disposeAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "generated-session-id",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
  });

  it("concurrent ensurePiSession calls await in-flight startup and return the same session ID", async () => {
    let resolveStart: ((value: { sessionId: string }) => void) | undefined;
    mocks.startAgent.mockImplementation(
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
      expect(mocks.startAgent).toHaveBeenCalled();
    });
    resolveStart?.({ sessionId: "generated-session-id" });

    const [id1, id2] = await Promise.all([firstPromise, secondPromise]);

    expect(id1.sessionId).toBe("generated-session-id");
    expect(id2.sessionId).toBe("generated-session-id");
    expect(id1.attached).toBe(false);
    // Pi must have been started only once.
    expect(mocks.startAgent).toHaveBeenCalledTimes(1);
  });

  it("reopens a session id only after an in-flight stop for it has settled", async () => {
    mocks.startAgent.mockResolvedValue({ sessionId: "history-close-reopen" });

    // Open the history session in a first tab.
    await ensurePiSession({
      tabId: "tab-close",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-close-reopen",
    });

    // Close the tab; pi.stop stays in flight until the test resolves it.
    let resolveStop: (() => void) | undefined;
    mocks.disposeAgent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        }),
    );
    const stopPromise = stopPiSession("tab-close");
    await vi.waitFor(() => {
      expect(mocks.disposeAgent).toHaveBeenCalledWith({
        runtime: "pi",
        sessionId: "history-close-reopen",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
      });
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
    expect(mocks.startAgent).toHaveBeenCalledTimes(1); // only the first open so far

    // Finish the teardown; the reopen then proceeds with a fresh pi.start.
    resolveStop?.();
    await stopPromise;
    await reopenPromise;

    expect(reopenSettled).toBe(true);
    expect(mocks.startAgent).toHaveBeenCalledTimes(2);
    expect(mocks.attachAgent).not.toHaveBeenCalled();
    expect(mocks.startAgent).toHaveBeenLastCalledWith(
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

    expect(mocks.disposeAgent).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]).toBeUndefined();
  });
});
