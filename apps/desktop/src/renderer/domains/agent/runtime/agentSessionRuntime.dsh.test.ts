// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { tabStore } from "../../../domains/workbench/state/tabStore";
import { abortAgent, retryDSHTranscript, sendAgentPrompt } from "../commands/agentChatCommands";
import { agentChatStore } from "../state/agentChatStore";
import { registerAgentChatEventRouter } from "../subscriptions/agentChatEventRouter";
import type { DSHFrontendPayload } from "../subscriptions/dshTranscript";
import {
  ensureAgentSession,
  findTabWithSession,
  recoverAgentSessionAfterReconnect,
  stopAgentSession,
} from "./agentSessionRuntime";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();

const mocks = vi.hoisted(() => ({
  startAgent: vi.fn(),
  attachAgent: vi.fn(),
  promptAgent: vi.fn(),
  abortAgent: vi.fn(),
  disposeAgent: vi.fn(),
  send: vi.fn(),
  closeAgentSession: vi.fn(),
  ensureChatSession: vi.fn(),
  listActiveSessions: vi.fn(),
  listDetectionStatuses: vi.fn(),
  listModels: vi.fn(),
  listProviders: vi.fn(),
  removeProvider: vi.fn(),
  rename: vi.fn(),
  runChatPrompt: vi.fn(),
  saveProvider: vi.fn(),
  readHistory: vi.fn(),
  getCapabilities: vi.fn(),
  dshEventHandler: null as ((payload: DSHFrontendPayload) => void) | null,
}));

vi.mock("@shared/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../subscriptions/agentChatDSHEventRouter", () => ({
  registerAgentChatDSHEventRouter: vi.fn((options: { onEvent: (payload: DSHFrontendPayload) => void }) => {
    mocks.dshEventHandler = options.onEvent;
    return () => {};
  }),
}));

vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
  readAgentRuntimeHistory: mocks.readHistory,
  getAgentCapabilities: mocks.getCapabilities,
  attachAgentSession: mocks.attachAgent,
  abortAgentSession: mocks.abortAgent,
  disposeAgentSession: mocks.disposeAgent,
  promptAgentSession: mocks.promptAgent,
  startAgentSession: mocks.startAgent,
  closeAgentSession: mocks.closeAgentSession,
  ensureWorkspaceChatSession: mocks.ensureChatSession,
  listActivePiCompatibilitySessions: mocks.listActiveSessions,
  listAgentDetectionStatuses: mocks.listDetectionStatuses,
  listAgentModels: mocks.listModels,
  listPiProviders: mocks.listProviders,
  removePiProvider: mocks.removeProvider,
  renamePiCompatibilitySession: mocks.rename,
  runWorkspaceChatPrompt: mocks.runChatPrompt,
  savePiProvider: mocks.saveProvider,
  sendPiCompatibilityCommand: mocks.send,
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  mocks.disposeAgent.mockReset();
  vi.clearAllMocks();
});

describe("agentSessionRuntime.DSH", () => {
  it("keeps equal Pi and DSH session ids in distinct tabs", () => {
    tabStore.setState({
      tabs: [
        {
          id: "pi-tab",
          workspaceId: "workspace-1",
          title: "Pi",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", sessionId: "same-id", runtime: "pi" },
        },
        {
          id: "dsh-tab",
          workspaceId: "workspace-1",
          title: "DSH",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", sessionId: "same-id", runtime: "dsh" },
        },
      ],
    });

    expect(findTabWithSession("same-id", "pi")).toBe("pi-tab");
    expect(findTabWithSession("same-id", "dsh")).toBe("dsh-tab");
  });

  it("uses neutral DSH lifecycle procedures and never sends Pi controls", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-session" });
    mocks.promptAgent.mockResolvedValue({ runtime: "dsh", ok: true });
    mocks.abortAgent.mockResolvedValue({ runtime: "dsh", ok: true });
    mocks.disposeAgent.mockResolvedValue({ runtime: "dsh", ok: true });

    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-session",
    });
    await sendAgentPrompt({ tabId: "tab-dsh", sessionId: "dsh-session", message: "Hello" });
    await abortAgent({ tabId: "tab-dsh", sessionId: "dsh-session" });
    await stopAgentSession("tab-dsh");

    expect(mocks.startAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.promptAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.abortAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.disposeAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(registerAgentChatEventRouter).not.toHaveBeenCalled();
  });

  it("omits Pi steering semantics from prompts while DSH is running", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-running" });
    mocks.promptAgent.mockResolvedValue({ runtime: "dsh", ok: true });
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-running",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-running",
    });
    agentChatStore.getState().setSessionState("tab-dsh-running", "running");

    await sendAgentPrompt({ tabId: "tab-dsh-running", sessionId: "dsh-running", message: "Steer this" });

    expect(mocks.promptAgent).toHaveBeenCalledWith(
      expect.not.objectContaining({ streamingBehavior: expect.anything() }),
    );
  });

  it("resumes an explicit DSH session without changing Pi start payloads", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-restored-session" });

    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-restored",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-restored-session",
    });

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "dsh",
      sessionId: "dsh-restored-session",
      tabId: "tab-dsh-restored",
      paneId: "pane-tab-dsh-restored",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      resume: true,
    });
  });

  it("starts a new DSH session without resume", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "generated-session-id" });

    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-new",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "dsh",
      sessionId: "generated-session-id",
      tabId: "tab-dsh-new",
      paneId: "pane-tab-dsh-new",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
  });

  it("does not block a DSH reopen on an equal-ID Pi close", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId: "same-id" });
    await ensureAgentSession({
      runtime: "pi",
      tabId: "pi-close-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "same-id",
    });

    let resolvePiDispose: (() => void) | undefined;
    mocks.disposeAgent.mockImplementation(({ runtime }: { runtime: string }) =>
      runtime === "pi"
        ? new Promise<void>((resolve) => {
            resolvePiDispose = resolve;
          })
        : Promise.resolve({ runtime: "dsh", ok: true }),
    );
    const closePromise = stopAgentSession("pi-close-tab");
    await vi.waitFor(() => expect(mocks.disposeAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "pi" })));

    const dshOpenPromise = ensureAgentSession({
      runtime: "dsh",
      tabId: "dsh-open-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "same-id",
    });
    await expect(dshOpenPromise).resolves.toMatchObject({ runtime: "dsh", sessionId: "same-id" });
    expect(mocks.startAgent).toHaveBeenLastCalledWith(expect.objectContaining({ runtime: "dsh" }));

    resolvePiDispose?.();
    await closePromise;
    await stopAgentSession("dsh-open-tab");
  });

  it("restarts an initially unavailable restored DSH session on reconnect without changing its identity", async () => {
    mocks.startAgent.mockRejectedValueOnce(new Error("dsh runtime unavailable")).mockResolvedValueOnce({
      runtime: "dsh",
      sessionId: "restored-dsh-session",
    });

    await expect(
      ensureAgentSession({
        runtime: "dsh",
        tabId: "tab-dsh-unavailable",
        workspaceId: "workspace-1",
        cwd: "/workspace",
        sessionId: "restored-dsh-session",
      }),
    ).rejects.toThrow("dsh runtime unavailable");

    await recoverAgentSessionAfterReconnect({
      runtime: "dsh",
      tabId: "tab-dsh-unavailable",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "restored-dsh-session",
    });

    expect(mocks.startAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ runtime: "dsh", sessionId: "restored-dsh-session", resume: true }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("attaches after the confirmed durable cursor on reconnect", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-cursor-session" });
    mocks.attachAgent.mockResolvedValue({ runtime: "dsh", ok: true });
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-cursor",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-cursor-session",
    });

    mocks.dshEventHandler?.({
      sessionId: "dsh-cursor-session",
      tabId: "tab-dsh-cursor",
      workspaceId: "workspace-1",
      incarnation: "run-1",
      update: { event: { type: "turn/end", seq: 0, time: 0, data: { turn: 0, reason: { kind: "completed" } } } },
    });
    mocks.dshEventHandler?.({
      sessionId: "dsh-cursor-session",
      tabId: "tab-dsh-cursor",
      workspaceId: "workspace-1",
      incarnation: "run-1",
      update: { cursor: { sessionId: "dsh-cursor-session", incarnation: "run-1", durableThroughSeq: 0 } },
    });

    await recoverAgentSessionAfterReconnect({
      runtime: "dsh",
      tabId: "tab-dsh-cursor",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-cursor-session",
    });

    expect(mocks.attachAgent).toHaveBeenLastCalledWith(expect.objectContaining({ runtime: "dsh", afterSeq: 0 }));
  });

  it("recovers a restarted DSH incarnation after an unavailable durable read without Pi calls", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-restarted" });
    mocks.readHistory
      .mockRejectedValueOnce(new Error("dsh runtime unavailable"))
      .mockRejectedValueOnce(new Error("dsh runtime unavailable"))
      .mockResolvedValueOnce({
        runtime: "dsh",
        dsh: {
          session: { sessionId: "dsh-restarted", createdAt: 0 },
          events: [],
          incarnation: "new-inc",
          asOfSeq: -1,
          durableThroughSeq: -1,
        },
      });
    mocks.getCapabilities
      .mockResolvedValueOnce({ dsh: { configured: true, ready: false } })
      .mockResolvedValueOnce({ dsh: { configured: true, ready: true } });
    mocks.attachAgent.mockResolvedValue({ runtime: "dsh", ok: true });

    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-restarted",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-restarted",
    });
    mocks.dshEventHandler?.({
      sessionId: "dsh-restarted",
      tabId: "tab-dsh-restarted",
      workspaceId: "workspace-1",
      incarnation: "old-inc",
      update: { reset: { sessionId: "dsh-restarted", incarnation: "old-inc", headSeq: -1 } },
    });

    await vi.waitFor(() =>
      expect(mocks.attachAgent).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: "dsh", sessionId: "dsh-restarted", afterSeq: -1 }),
      ),
    );
    expect(mocks.readHistory).toHaveBeenCalledTimes(3);
    expect(mocks.getCapabilities).toHaveBeenCalledTimes(2);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps polling an unavailable DSH runtime beyond its one-second restart backoff", async () => {
    vi.useFakeTimers();
    try {
      mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-supervisor-restart" });
      let historyAttempts = 0;
      mocks.readHistory.mockImplementation(async () => {
        historyAttempts++;
        if (historyAttempts <= 11) throw new Error("dsh runtime unavailable");
        return {
          runtime: "dsh",
          dsh: {
            session: { sessionId: "dsh-supervisor-restart", createdAt: 0 },
            events: [],
            incarnation: "run-1",
            asOfSeq: -1,
            durableThroughSeq: -1,
          },
        };
      });
      mocks.getCapabilities.mockResolvedValue({ dsh: { configured: true, ready: false } });
      mocks.attachAgent.mockResolvedValue({ runtime: "dsh", ok: true });

      await ensureAgentSession({
        runtime: "dsh",
        tabId: "tab-dsh-supervisor-restart",
        workspaceId: "workspace-1",
        cwd: "/workspace",
        sessionId: "dsh-supervisor-restart",
      });
      mocks.dshEventHandler?.({
        sessionId: "dsh-supervisor-restart",
        tabId: "tab-dsh-supervisor-restart",
        workspaceId: "workspace-1",
        incarnation: "run-1",
        update: { reset: { sessionId: "dsh-supervisor-restart", incarnation: "run-1", headSeq: -1 } },
      });

      await vi.advanceTimersByTimeAsync(1_100);

      expect(historyAttempts).toBe(12);
      expect(mocks.attachAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh", afterSeq: -1 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries DSH transcript recovery without restarting or changing runtimes", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-retry-session" });
    mocks.readHistory.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "dsh-retry-session", createdAt: 0 },
        events: [],
        incarnation: "run-1",
        asOfSeq: -1,
        durableThroughSeq: -1,
      },
    });
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-retry",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-retry-session",
    });
    mocks.dshEventHandler?.({
      sessionId: "dsh-retry-session",
      tabId: "tab-dsh-retry",
      workspaceId: "workspace-1",
      incarnation: "run-1",
      update: { reset: { sessionId: "dsh-retry-session", incarnation: "run-1", headSeq: -1 } },
    });
    await vi.waitFor(() => expect(agentChatStore.getState().sessionsByTabId["tab-dsh-retry"]?.state).toBe("error"));
    await recoverAgentSessionAfterReconnect({
      runtime: "dsh",
      tabId: "tab-dsh-retry",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-retry-session",
    });

    expect(mocks.readHistory).toHaveBeenCalledTimes(1);
    await retryDSHTranscript("tab-dsh-retry");

    expect(mocks.readHistory).toHaveBeenCalledTimes(2);
    expect(mocks.startAgent).toHaveBeenCalledTimes(1);
  });

  it("attaches DSH from the initial replay cursor and retains DSH after a failure", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-dsh-recover",
          workspaceId: "workspace-1",
          title: "Agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", sessionId: "dsh-session", runtime: "dsh" },
        },
      ],
    });
    mocks.startAgent.mockRejectedValue(Object.assign(new Error("agent session already exists"), { code: -32003 }));
    mocks.attachAgent
      .mockResolvedValueOnce({ runtime: "dsh", ok: true })
      .mockRejectedValueOnce(new Error("DSH unavailable"));
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-recover",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-session",
    });
    await recoverAgentSessionAfterReconnect({
      runtime: "dsh",
      tabId: "tab-dsh-recover",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-session",
    });

    expect(mocks.attachAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh", afterSeq: -1 }));
    const tab = tabStore.getState().tabs.find((candidate) => candidate.id === "tab-dsh-recover");
    expect(tab?.kind === "agent-chat" ? tab.data.runtime : undefined).toBe("dsh");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
