// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { abortAgent, sendAgentPrompt } from "../commands/agentChatCommands";
import { agentChatStore } from "../state/agentChatStore";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "../subscriptions/agentChatEventRouter";
import { ensureAgentSession, ensurePiSession, stopAgentSession, stopPiSession } from "./agentSessionRuntime";
import { dshStartResult } from "./agentSessionRuntime.dsh.testSupport";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

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
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  mocks.disposeAgent.mockReset();
  vi.clearAllMocks();
});
describe.each(["pi", "dsh"] as const)("agentSessionRuntime pre-start close (%s)", (runtime) => {
  it("defers close through prior teardown and disposes the eventual backend start exactly once", async () => {
    const sessionId = `${runtime}-pre-start`;
    mocks.startAgent.mockResolvedValue(runtime === "dsh" ? dshStartResult(sessionId) : { runtime, sessionId });
    await ensureAgentSession({
      runtime,
      tabId: `${runtime}-old`,
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId,
    });

    let resolvePriorDispose: (() => void) | undefined;
    mocks.disposeAgent.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePriorDispose = resolve;
        }),
    );
    const priorStop = stopAgentSession(`${runtime}-old`);
    await vi.waitFor(() => expect(mocks.disposeAgent).toHaveBeenCalledTimes(1));

    const ensurePromise = ensureAgentSession({
      runtime,
      tabId: `${runtime}-new`,
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId,
    });
    const stopPromise = stopAgentSession(`${runtime}-new`);
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.startAgent).toHaveBeenCalledTimes(1);
    expect(mocks.disposeAgent).toHaveBeenCalledTimes(1);

    resolvePriorDispose?.();
    await priorStop;
    await ensurePromise;
    await stopPromise;

    expect(mocks.startAgent).toHaveBeenCalledTimes(2);
    expect(mocks.disposeAgent).toHaveBeenCalledTimes(2);
    expect(mocks.disposeAgent).toHaveBeenLastCalledWith(expect.objectContaining({ runtime, sessionId }));
  });
});

describe("agentSessionRuntime Pi router wait", () => {
  it("defers close until router readiness permits the backend start", async () => {
    let resolveRouterReady: (() => void) | undefined;
    vi.mocked(ensureAgentChatEventRouterReady).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRouterReady = resolve;
        }),
    );
    mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId: "pi-router-wait" });

    const ensurePromise = ensurePiSession({
      tabId: "tab-router-wait",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "pi-router-wait",
    });
    const stopPromise = stopPiSession("tab-router-wait");
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.startAgent).not.toHaveBeenCalled();
    expect(mocks.disposeAgent).not.toHaveBeenCalled();

    resolveRouterReady?.();
    await ensurePromise;
    await stopPromise;

    expect(mocks.startAgent).toHaveBeenCalledTimes(1);
    expect(mocks.disposeAgent).toHaveBeenCalledTimes(1);
  });
});

describe("agentSessionRuntime.ensurePiSession", () => {
  it("uses neutral agent procedures for production Pi start, prompt, abort, and dispose", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId: "neutral-session" });
    mocks.promptAgent.mockResolvedValue({ runtime: "pi", ok: true });
    mocks.abortAgent.mockResolvedValue({ runtime: "pi", ok: true });
    mocks.disposeAgent.mockResolvedValue({ runtime: "pi", ok: true });

    await ensurePiSession({
      tabId: "tab-neutral",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
      sessionId: "neutral-session",
    });
    await sendAgentPrompt({ tabId: "tab-neutral", sessionId: "neutral-session", message: "Hello" });
    await abortAgent({ tabId: "tab-neutral", sessionId: "neutral-session" });
    expect(agentChatStore.getState().sessionsByTabId["tab-neutral"]?.sessionId).toBe("neutral-session");
    await stopPiSession("tab-neutral");

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "neutral-session",
      tabId: "tab-neutral",
      paneId: "pane-tab-neutral",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
    });
    expect(mocks.promptAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "neutral-session",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
      message: "Hello",
      streamingBehavior: undefined,
    });
    expect(mocks.abortAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "neutral-session",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
    });
    expect(mocks.disposeAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "neutral-session",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("passes paneId through to pi.start", async () => {
    mocks.startAgent.mockResolvedValue({ sessionId: "generated-session-id" });

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

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "generated-session-id",
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-1",
    });
  });

  it("uses a deterministic pane fallback when paneId is omitted", async () => {
    mocks.startAgent.mockResolvedValue({ sessionId: "pi-session-2" });

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

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "generated-session-id",
      tabId: "tab-pane-fallback",
      workspaceId: "workspace-2",
      cwd: "/tmp/project-2",
      paneId: "pane-tab-pane-fallback",
    });
  });

  it("reopens history sessions by starting with the existing session id", async () => {
    mocks.startAgent.mockResolvedValue({ sessionId: "history-session-1" });

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

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "history-session-1",
      tabId: "tab-history-resume",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-history",
    });
    expect(mocks.attachAgent).not.toHaveBeenCalled();
  });

  it("attaches only when start reports that the live daemon session already exists", async () => {
    mocks.startAgent.mockRejectedValue(Object.assign(new Error("agent session already exists"), { code: -32003 }));
    mocks.attachAgent.mockResolvedValue({ ok: true });

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

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "live-session-1",
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-tab-reattach",
    });
    expect(mocks.attachAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "live-session-1",
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
  });

  it("does not attach when start fails for reasons other than an already-running live session", async () => {
    mocks.startAgent.mockRejectedValue(new Error("pi session not found"));

    await expect(
      ensurePiSession({
        tabId: "tab-start-failure",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "missing-session-1",
      }),
    ).rejects.toThrow("pi session not found");

    expect(mocks.attachAgent).not.toHaveBeenCalled();
    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-start-failure",
      sessionId: "missing-session-1",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();
  });

  it("prefers explicit session ids over stale local chat-session state", async () => {
    agentChatStore.getState().initSession("tab-explicit-live", "stale-session");
    mocks.startAgent.mockResolvedValue({ sessionId: "live-session-2" });

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

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "live-session-2",
      tabId: "tab-explicit-live",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-tab-explicit-live",
    });
  });

  it("clears the previous turn error when sending a new prompt", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId: "session-send" });
    await ensurePiSession({
      tabId: "tab-send",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-send",
    });
    agentChatStore.getState().setTurnError("tab-send", "previous turn failed");

    await sendAgentPrompt({
      tabId: "tab-send",
      sessionId: "session-send",
      message: "try again",
    });

    expect(mocks.promptAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "session-send",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      message: "try again",
      streamingBehavior: undefined,
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-send"]?.turnError).toBeNull();
  });
});
