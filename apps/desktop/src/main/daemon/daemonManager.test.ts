import { describe, expect, it, vi } from "vitest";
import { DaemonManager } from "./daemonManager";

describe("DaemonManager", () => {
  it("starts the daemon service through CLI", async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const manager = new DaemonManager({ run });

    await manager.ensureStarted();

    expect(run).toHaveBeenCalledWith(["daemon", "start", "--jwt-required=false"]);
  });

  it("throws when daemon start exits non-zero", async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "start failed",
    });
    const manager = new DaemonManager({ run });

    await expect(manager.ensureStarted()).rejects.toThrow("Failed to start daemon");
  });

  it("treats daemon-not-running stop failures as no-op", async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "Error: daemon is not running",
    });
    const logger = { warn: vi.fn() };
    const manager = new DaemonManager({ run, logger });

    await manager.stop();

    expect(run).toHaveBeenCalledWith(["daemon", "stop"]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs one warning when daemon stop fails unexpectedly", async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "permission denied",
    });
    const logger = { warn: vi.fn() };
    const manager = new DaemonManager({ run, logger });

    await manager.stop();

    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
