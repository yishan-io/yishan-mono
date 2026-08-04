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

describe("useAgentChatSessionLifecycle reconnect recovery", () => {
  it("re-starts the session when reattach fails after a daemon reconnect", async () => {
    agentChatStore.getState().initSession("tab-1", "session-1");
    mocks.ensurePiSession.mockResolvedValue("session-1");
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
