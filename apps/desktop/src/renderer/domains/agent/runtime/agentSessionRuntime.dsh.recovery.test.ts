// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { tabStore } from "../../../domains/workbench/state/tabStore";
import { retryDSHTranscript } from "../commands/agentChatCommands";
import { agentChatStore } from "../state/agentChatStore";
import type { DSHFrontendPayload } from "../subscriptions/dshTranscript";
import { ensureAgentSession, recoverAgentSessionAfterReconnect } from "./agentSessionRuntime";
import { dshAttachResult, resetDshTestState } from "./agentSessionRuntime.dsh.testSupport";

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
  resetDshTestState();
  mocks.disposeAgent.mockReset();
  vi.clearAllMocks();
});

describe("agentSessionRuntime.DSH recovery", () => {
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

  it("applies the recovery attach snapshot when no replay notifications arrive", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-recovery-attach" });
    mocks.readHistory.mockResolvedValue({
      runtime: "dsh",
      dsh: {
        session: { sessionId: "dsh-recovery-attach", createdAt: 0 },
        events: [],
        incarnation: "run-1",
        asOfSeq: -1,
        durableThroughSeq: -1,
      },
    });
    mocks.attachAgent.mockResolvedValue({
      runtime: "dsh",
      sessionId: "dsh-recovery-attach",
      incarnation: "run-1",
      events: [
        {
          type: "user/message",
          seq: 0,
          time: 0,
          data: {
            id: "recovery-attach-user",
            role: "user",
            content: [{ type: "text", text: "Recovered from attach" }],
            source: { kind: "user" },
          },
          surfaceOp: "append",
        },
      ],
      asOfSeq: 0,
      durableThroughSeq: 0,
      headSeq: 0,
    });
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-recovery-attach",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-recovery-attach",
    });

    mocks.dshEventHandler?.({
      sessionId: "dsh-recovery-attach",
      tabId: "tab-dsh-recovery-attach",
      workspaceId: "workspace-1",
      incarnation: "run-1",
      update: { reset: { sessionId: "dsh-recovery-attach", incarnation: "run-1", headSeq: -1 } },
    });

    await vi.waitFor(() =>
      expect(agentChatStore.getState().sessionsByTabId["tab-dsh-recovery-attach"]?.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "recovery-attach-user" })]),
      ),
    );
    expect(agentChatStore.getState().sessionsByTabId["tab-dsh-recovery-attach"]?.state).not.toBe("error");
  });

  it("attaches after the confirmed durable cursor on reconnect", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-cursor-session" });
    mocks.attachAgent.mockImplementation(({ sessionId }: { sessionId: string }) =>
      Promise.resolve(dshAttachResult(sessionId)),
    );
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
      .mockRejectedValueOnce(
        Object.assign(new Error("runtime request failed"), { data: { code: "DSH_RUNTIME_UNAVAILABLE" } }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("runtime request failed"), { data: { code: "DSH_RUNTIME_UNAVAILABLE" } }),
      )
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
    mocks.attachAgent.mockImplementation(({ sessionId }: { sessionId: string }) =>
      Promise.resolve(dshAttachResult(sessionId)),
    );

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
        if (historyAttempts <= 11)
          throw Object.assign(new Error("runtime request failed"), { data: { code: "DSH_RUNTIME_UNAVAILABLE" } });
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
      mocks.attachAgent.mockImplementation(({ sessionId }: { sessionId: string }) =>
        Promise.resolve(dshAttachResult(sessionId)),
      );

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
      .mockResolvedValueOnce(dshAttachResult("dsh-session"))
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
