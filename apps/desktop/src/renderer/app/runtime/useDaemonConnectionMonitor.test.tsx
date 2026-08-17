// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionStore } from "../../features/session/state/sessionStore";
import { useDaemonConnectionMonitor } from "./useDaemonConnectionMonitor";

type RawEventListener = (event: { method: string; payload?: unknown }) => void;
type StatusListener = (status: "connected" | "connecting" | "disconnected") => void;

const mocked = vi.hoisted(() => ({
  rawListeners: new Set<RawEventListener>(),
  statusListeners: new Set<StatusListener>(),
  subscribeDesktopRpcEvent: vi.fn((listener: RawEventListener) => {
    mocked.rawListeners.add(listener);
    return () => mocked.rawListeners.delete(listener);
  }),
  subscribeDaemonConnectionStatus: vi.fn((listener: StatusListener) => {
    mocked.statusListeners.add(listener);
    listener("connecting");
    return () => mocked.statusListeners.delete(listener);
  }),
}));

vi.mock("../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: mocked.subscribeDaemonConnectionStatus,
  subscribeDesktopRpcEvent: mocked.subscribeDesktopRpcEvent,
}));

describe("useDaemonConnectionMonitor", () => {
  afterEach(() => {
    mocked.rawListeners.clear();
    mocked.statusListeners.clear();
    vi.clearAllMocks();
    sessionStore.setState({ daemonId: undefined, daemonVersion: undefined });
  });

  it("tracks connection status updates", () => {
    const { result } = renderHook(() => useDaemonConnectionMonitor());

    expect(result.current).toBe("connecting");
    act(() => {
      for (const listener of mocked.statusListeners) {
        listener("disconnected");
      }
    });

    expect(result.current).toBe("disconnected");
  });

  it("refreshes daemon identity from reconnect events", () => {
    renderHook(() => useDaemonConnectionMonitor());

    for (const listener of mocked.rawListeners) {
      listener({
        method: "daemon.info.refreshed",
        payload: { daemonId: "daemon-2", version: "0.2.0", wsUrl: "ws://127.0.0.1:4243/ws" },
      });
    }

    expect(sessionStore.getState().daemonId).toBe("daemon-2");
    expect(sessionStore.getState().daemonVersion).toBe("0.2.0");
  });
});
