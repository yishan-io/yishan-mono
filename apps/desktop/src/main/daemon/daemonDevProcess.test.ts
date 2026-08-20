import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCliInvocation: vi.fn(() => ({ executablePath: "yishan", prefixArgs: [] })),
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("./daemonCliInvocation", () => ({ resolveCliInvocation: mocks.resolveCliInvocation }));
vi.mock("./daemonEndpoint", () => ({ resolveCliProfileName: () => "dev" }));

import { DaemonDevProcess } from "./daemonDevProcess";

type MockChild = EventEmitter & {
  exitCode: number | null;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  signalCode: NodeJS.Signals | null;
};

function createChild(emitExitOnKill = true): MockChild {
  const child = new EventEmitter() as MockChild;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal?: NodeJS.Signals) => {
    child.killed = true;
    if (emitExitOnKill || signal === "SIGKILL") {
      child.signalCode = signal ?? null;
      child.emit("exit", null, signal ?? null);
    }
    return true;
  });
  return child;
}

function asChildProcess(child: MockChild): ChildProcess {
  return child as unknown as ChildProcess;
}

afterEach(() => {
  mocks.spawn.mockReset();
  mocks.resolveCliInvocation.mockClear();
  vi.useRealTimers();
});

describe("DaemonDevProcess", () => {
  it("keeps an owned child when its health check succeeds", async () => {
    const child = createChild();
    const lifecycleEvents: string[] = [];
    mocks.spawn.mockImplementation(() => {
      lifecycleEvents.push("spawn");
      return asChildProcess(child);
    });
    const waitForHealthy = vi.fn().mockResolvedValue(undefined);
    const stopProfileDaemon = vi.fn().mockImplementation(async () => {
      lifecycleEvents.push("stop-profile");
    });
    const daemonProcess = new DaemonDevProcess();

    await daemonProcess.start(waitForHealthy, stopProfileDaemon);
    await daemonProcess.start(waitForHealthy, stopProfileDaemon);

    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(waitForHealthy).toHaveBeenCalledTimes(2);
    expect(stopProfileDaemon).toHaveBeenCalledOnce();
    expect(lifecycleEvents).toEqual(["stop-profile", "spawn"]);
  });

  it("stops an unhealthy owned child before starting a replacement", async () => {
    const unhealthyChild = createChild();
    const replacementChild = createChild();
    mocks.spawn
      .mockReturnValueOnce(asChildProcess(unhealthyChild))
      .mockReturnValueOnce(asChildProcess(replacementChild));
    const waitForHealthy = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const stopProfileDaemon = vi.fn().mockResolvedValue(undefined);
    const daemonProcess = new DaemonDevProcess();

    await daemonProcess.start(waitForHealthy, stopProfileDaemon);
    await daemonProcess.start(waitForHealthy, stopProfileDaemon);

    expect(unhealthyChild.kill).toHaveBeenCalledWith(process.platform === "win32" ? undefined : "SIGTERM");
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(stopProfileDaemon).toHaveBeenCalledTimes(2);
  });

  it("force-kills a child that does not exit after termination", async () => {
    vi.useFakeTimers();
    const child = createChild(false);
    mocks.spawn.mockReturnValue(asChildProcess(child));
    const daemonProcess = new DaemonDevProcess();
    await daemonProcess.start(
      async () => undefined,
      async () => undefined,
    );

    const stopTask = daemonProcess.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    await stopTask;

    expect(child.kill).toHaveBeenNthCalledWith(1, process.platform === "win32" ? undefined : "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, process.platform === "win32" ? undefined : "SIGKILL");
  });
});
