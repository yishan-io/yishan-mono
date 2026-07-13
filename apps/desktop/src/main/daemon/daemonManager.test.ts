import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonManager } from "./daemonManager";

const originalDaemonHealthUrl = process.env.YISHAN_DAEMON_HEALTH_URL;

afterEach(() => {
  process.env.YISHAN_DAEMON_HEALTH_URL = originalDaemonHealthUrl;
});

describe("DaemonManager", () => {
  it("starts the daemon service through CLI", async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));
    const manager = new DaemonManager({ run, fetch });

    await expect(manager.ensureStarted()).rejects.toThrow("Daemon did not become healthy after start");

    expect(run).toHaveBeenCalledWith(["daemon", "start", "--profile", "default"]);
  });

  it("throws when daemon start exits non-zero", async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "start failed",
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));
    const manager = new DaemonManager({ run, fetch });

    await expect(manager.ensureStarted()).rejects.toThrow("Failed to start daemon");
  });

  it("treats daemon-not-running stop failures as no-op", async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 6,
      stdout: "",
      stderr: "",
    });
    const logger = { warn: vi.fn(), log: vi.fn() };
    const manager = new DaemonManager({ run, logger });

    await manager.stop();

    expect(run).toHaveBeenCalledWith(["daemon", "stop", "--profile", "default"]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs one warning when daemon stop fails unexpectedly", async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "permission denied",
    });
    const logger = { warn: vi.fn(), log: vi.fn() };
    const manager = new DaemonManager({ run, logger });

    await manager.stop();

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("recovers daemon info without forcing restart when health checks succeed during recovery", async () => {
    process.env.YISHAN_DAEMON_HEALTH_URL = "http://127.0.0.1:65000/healthz";

    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("missing daemon state"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: "1.2.3", daemonId: "daemon-1" }),
      } as Response);
    const logger = { warn: vi.fn(), log: vi.fn() };
    const manager = new DaemonManager({ run, fetch, logger });

    await expect(manager.getInfo()).resolves.toEqual({
      version: "1.2.3",
      daemonId: "daemon-1",
      wsUrl: "ws://127.0.0.1:65000/ws",
    });

    expect(run).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs and throws when daemon info still cannot be loaded after recovery", async () => {
    process.env.YISHAN_DAEMON_HEALTH_URL = "http://127.0.0.1:65000/healthz";

    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("missing daemon state"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockRejectedValueOnce(new Error("still offline"));
    const logger = { warn: vi.fn(), log: vi.fn() };
    const manager = new DaemonManager({ run, fetch, logger });

    await expect(manager.getInfo()).rejects.toThrow("Failed to load daemon info: still offline");
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("after recovery"));
  });
});
