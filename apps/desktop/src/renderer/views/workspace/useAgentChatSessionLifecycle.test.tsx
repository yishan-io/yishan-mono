// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../../store/agentChatStore";
import { useAgentChatSessionLifecycle } from "./useAgentChatSessionLifecycle";

type ConnectionStatus = "connected" | "disconnected";

const mocks = vi.hoisted(() => ({
  statusListener: null as ((status: ConnectionStatus) => void) | null,
  clearPiSessionHandle: vi.fn(),
  ensurePiSession: vi.fn(),
  fetchAgentState: vi.fn(),
  fetchAgentMessages: vi.fn(),
  fetchAgentModels: vi.fn(),
  findTabWithSession: vi.fn(),
  reattachPiSession: vi.fn(),
  refreshAgentSessionStats: vi.fn(),
}));

vi.mock("../../commands/agentChatCommands", () => ({
  clearPiSessionHandle: mocks.clearPiSessionHandle,
  ensurePiSession: mocks.ensurePiSession,
  fetchAgentMessages: mocks.fetchAgentMessages,
  fetchAgentModels: mocks.fetchAgentModels,
  fetchAgentState: mocks.fetchAgentState,
  findTabWithSession: mocks.findTabWithSession,
  reattachPiSession: mocks.reattachPiSession,
  refreshAgentSessionStats: mocks.refreshAgentSessionStats,
}));

vi.mock("../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: (listener: (status: ConnectionStatus) => void) => {
    mocks.statusListener = listener;
    return () => {
      if (mocks.statusListener === listener) {
        mocks.statusListener = null;
      }
    };
  },
}));

const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  cleanup();
  agentChatStore.setState(initialAgentChatStoreState, true);
  mocks.statusListener = null;
  vi.clearAllMocks();
});

function seedLiveSession(tabId: string, sessionId: string): void {
  agentChatStore.getState().initSession(tabId, sessionId);
  mocks.ensurePiSession.mockResolvedValue({ sessionId, attached: false });
}

describe("useAgentChatSessionLifecycle runtime-interrupt classification", () => {
  it("marks pre-existing history interrupted after a fresh start (previous process dead)", async () => {
    seedLiveSession("tab-fresh", "session-1");

    renderHook(() =>
      useAgentChatSessionLifecycle({
        tabId: "tab-fresh",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "session-1",
        sessionView: "full",
      }),
    );
    await act(async () => {});

    const endedAtMs = agentChatStore.getState().sessionsByTabId["tab-fresh"]?.subagentSessionEndedAtMs;
    expect(endedAtMs).not.toBeNull();
    expect(endedAtMs).toBeLessThanOrEqual(Date.now());
  });

  it("keeps rows live after an attach to a still-alive process", async () => {
    agentChatStore.getState().initSession("tab-attach", "session-1");
    mocks.ensurePiSession.mockResolvedValue({ sessionId: "session-1", attached: true });

    renderHook(() =>
      useAgentChatSessionLifecycle({
        tabId: "tab-attach",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "session-1",
        sessionView: "full",
      }),
    );
    await act(async () => {});

    expect(agentChatStore.getState().sessionsByTabId["tab-attach"]?.subagentSessionEndedAtMs).toBeNull();
  });

  it("keeps rows live after a successful reattach (connection drop, process alive)", async () => {
    agentChatStore.getState().initSession("tab-reattach-live", "session-1");
    mocks.ensurePiSession.mockResolvedValue({ sessionId: "session-1", attached: false });
    mocks.reattachPiSession.mockResolvedValue({ ok: true });

    renderHook(() =>
      useAgentChatSessionLifecycle({
        tabId: "tab-reattach-live",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "session-1",
        sessionView: "full",
      }),
    );
    await act(async () => {});
    // Simulate a prior session_end on the same tab being healed by the reconnect.
    agentChatStore.getState().setSubagentSessionEndedAt("tab-reattach-live", Date.now());

    const listener = mocks.statusListener;
    act(() => listener?.("connected")); // initial observed state
    act(() => listener?.("disconnected"));
    await act(async () => listener?.("connected")); // reconnect → reattach

    await vi.waitFor(() => {
      expect(mocks.reattachPiSession).toHaveBeenCalledTimes(1);
    });
    // The process survived the connection drop; rows must be live again and no
    // error path may have fired.
    expect(agentChatStore.getState().sessionsByTabId["tab-reattach-live"]?.subagentSessionEndedAtMs).toBeNull();
    expect(agentChatStore.getState().sessionsByTabId["tab-reattach-live"]?.state).not.toBe("error");
  });
});

describe("useAgentChatSessionLifecycle reconnect recovery", () => {
  it("re-starts the session when reattach fails after a daemon reconnect", async () => {
    agentChatStore.getState().initSession("tab-1", "session-1");
    mocks.ensurePiSession.mockResolvedValue({ sessionId: "session-1", attached: false });
    mocks.reattachPiSession.mockRejectedValue(new Error("pi session not found: session-1"));

    renderHook(() =>
      useAgentChatSessionLifecycle({
        tabId: "tab-1",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "session-1",
        sessionView: "full",
      }),
    );
    await act(async () => {});

    const listener = mocks.statusListener;
    expect(listener).not.toBeNull();
    act(() => listener?.("connected")); // initial observed state
    act(() => listener?.("disconnected"));
    await act(async () => listener?.("connected")); // reconnect → reattach + recovery

    expect(mocks.reattachPiSession).toHaveBeenCalledWith("tab-1");
    expect(mocks.clearPiSessionHandle).toHaveBeenCalledWith("tab-1");

    // Mount path + recovery path each run the full start/fetch chain.
    await vi.waitFor(() => {
      expect(mocks.ensurePiSession).toHaveBeenCalledTimes(2);
      expect(mocks.ensurePiSession).toHaveBeenLastCalledWith({
        tabId: "tab-1",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "session-1",
        sessionView: "full",
        paneId: undefined,
      });
    });
    expect(mocks.fetchAgentState).toHaveBeenCalledTimes(2);
    expect(mocks.fetchAgentMessages).toHaveBeenCalledTimes(2);
    expect(mocks.fetchAgentModels).toHaveBeenCalledTimes(2);
    expect(mocks.refreshAgentSessionStats).toHaveBeenCalledWith("session-1");
  });

  it("skips reattach and recovery for read-only subagent-detail tabs", async () => {
    agentChatStore.getState().initSession("tab-sub", "child-session-1");

    renderHook(() =>
      useAgentChatSessionLifecycle({
        tabId: "tab-sub",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionView: "subagent-detail",
        subagentParentSessionId: "parent-session-1",
      }),
    );
    await act(async () => {});

    const listener = mocks.statusListener;
    act(() => listener?.("connected"));
    act(() => listener?.("disconnected"));
    await act(async () => listener?.("connected"));

    expect(mocks.reattachPiSession).not.toHaveBeenCalled();
    // Only the mount-time start ran; the reconnect must not re-create the
    // child session standalone.
    expect(mocks.ensurePiSession).toHaveBeenCalledTimes(1);
    expect(mocks.clearPiSessionHandle).not.toHaveBeenCalled();
  });
});
