import { describe, expect, it, vi } from "vitest";
import { prepareForRestart } from "./restartPreparation";
describe("prepareForRestart", () => {
  it("marks quit intent before cleanup and stops daemon conditionally", async () => {
    const calls: string[] = [];
    await prepareForRestart({
      markQuitting: () => calls.push("quit"),
      flushHistory: async () => {
        calls.push("history");
      },
      shouldStopDaemon: () => true,
      stopDaemon: async () => {
        calls.push("daemon");
      },
    });
    expect(calls).toEqual(["quit", "history", "daemon"]);
  });
  it("continues after cleanup failures", async () => {
    const stopDaemon = vi.fn();
    await prepareForRestart({
      markQuitting: vi.fn(),
      flushHistory: async () => {
        throw new Error("failed");
      },
      shouldStopDaemon: () => true,
      stopDaemon,
    });
    expect(stopDaemon).toHaveBeenCalledOnce();
  });
  it("does not stop daemon when preference disables it", async () => {
    const stopDaemon = vi.fn();
    await prepareForRestart({
      markQuitting: vi.fn(),
      flushHistory: async () => {},
      shouldStopDaemon: () => false,
      stopDaemon,
    });
    expect(stopDaemon).not.toHaveBeenCalled();
  });
});
