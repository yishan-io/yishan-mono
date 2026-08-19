// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../../../state/agentChatStore";
import { useAgentChatSessionLifecycle } from "./useAgentChatSessionLifecycle";

type ConnectionStatus = "connected" | "disconnected";

const mocks = vi.hoisted(() => ({
  statusListener: null as ((status: ConnectionStatus) => void) | null,
  startAgentChatSession: vi.fn(async () => {}),
  recoverAgentSessionAfterReconnect: vi.fn(async () => {}),
}));

vi.mock("../../../commands/agentChatCommands", () => ({
  startAgentChatSession: mocks.startAgentChatSession,
  recoverAgentSessionAfterReconnect: mocks.recoverAgentSessionAfterReconnect,
}));

vi.mock("../../../../../rpc/rpcTransport", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
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

describe("useAgentChatSessionLifecycle React binding", () => {
  it("starts the session on mount with the expected options", async () => {
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

    expect(mocks.startAgentChatSession).toHaveBeenCalledTimes(1);
    expect(mocks.startAgentChatSession).toHaveBeenCalledWith({
      tabId: "tab-fresh",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-1",
      sessionView: "full",
      paneId: undefined,
      subagentParentSessionId: undefined,
    });
  });

  it("recovers the live session after a daemon reconnect", async () => {
    agentChatStore.getState().initSession("tab-reattach-live", "session-1");

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

    const listener = mocks.statusListener;
    act(() => listener?.("connected")); // initial observed state
    act(() => listener?.("disconnected"));
    await act(async () => listener?.("connected")); // reconnect → recovery

    expect(mocks.recoverAgentSessionAfterReconnect).toHaveBeenCalledTimes(1);
    expect(mocks.recoverAgentSessionAfterReconnect).toHaveBeenCalledWith({
      tabId: "tab-reattach-live",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-1",
      sessionView: "full",
      paneId: undefined,
    });
  });

  it("skips recovery for read-only subagent-detail tabs", async () => {
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

    expect(mocks.recoverAgentSessionAfterReconnect).not.toHaveBeenCalled();
    // Only the mount-time start ran; the reconnect must not re-create the
    // child session standalone.
    expect(mocks.startAgentChatSession).toHaveBeenCalledTimes(1);
  });
});
