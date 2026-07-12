// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../main/ipc";

const mocks = vi.hoisted(() => ({
  startSubscription: vi.fn(async () => "subscription-1"),
  stopSubscription: vi.fn(),
  invokeApi: vi.fn(),
  bridgeSubscribe: vi.fn(() => vi.fn()),
  getDaemonInfo: vi.fn(async () => ({
    daemonId: "daemon-1",
    version: "0.0.0-test",
    wsUrl: "ws://daemon.test",
  })),
}));

vi.mock("./daemonClient", () => ({
  DaemonClient: class {
    startSubscription = mocks.startSubscription;
    invokeApi = mocks.invokeApi;
    stopSubscription = mocks.stopSubscription;
    workspace = {};
    file = {};
    git = {};
    terminal = {
      createSession: vi.fn(),
      writeInput: vi.fn(),
      resize: vi.fn(),
      readOutput: vi.fn(),
      closeSession: vi.fn(),
      killProcess: vi.fn(),
      listDetectedPorts: vi.fn(),
      setActiveWorkspace: vi.fn(),
      getResourceUsage: vi.fn(),
      listSessions: vi.fn(),
    };
    context = {
      getState: vi.fn(),
      setCurrentOrg: vi.fn(),
      setActiveProject: vi.fn(),
      setActiveFile: vi.fn(),
    };
  },
}));

describe("rpcTransport backend event subscription", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (window as typeof window & { __YISHAN__?: DesktopBridge }).__YISHAN__ = {
      host: {
        getDaemonInfo: mocks.getDaemonInfo,
      },
      events: {
        subscribe: mocks.bridgeSubscribe,
      },
    } as unknown as DesktopBridge;
  });

  it("creates only one frontendStream subscription for concurrent desktop RPC listeners", async () => {
    const { subscribeDesktopRpcEvent } = await import("./rpcTransport");

    const unsubscribeFirst = subscribeDesktopRpcEvent(() => undefined);
    const unsubscribeSecond = subscribeDesktopRpcEvent(() => undefined);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.startSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.startSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "events",
        method: "frontendStream",
      }),
    );

    unsubscribeFirst();
    unsubscribeSecond();
  });
});
