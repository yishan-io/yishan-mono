import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  readActiveAccountUserId: vi.fn(),
  resolveAccountDaemonLogFilePath: vi.fn(),
  resolveDaemonLogFilePath: vi.fn(),
  resolveLegacyDaemonLogFilePath: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("./daemonEndpoint", () => ({
  readActiveAccountUserId: mocks.readActiveAccountUserId,
  resolveAccountDaemonLogFilePath: mocks.resolveAccountDaemonLogFilePath,
  resolveDaemonLogFilePath: mocks.resolveDaemonLogFilePath,
  resolveLegacyDaemonLogFilePath: mocks.resolveLegacyDaemonLogFilePath,
}));

import { DaemonHost } from "./daemonHost";

function createDaemonHost() {
  return new DaemonHost({ stop: vi.fn(), ensureStarted: vi.fn(), getInfo: vi.fn() }, vi.fn(), vi.fn());
}

describe("DaemonHost log reading", () => {
  beforeEach(() => {
    mocks.readFile.mockReset();
    mocks.readActiveAccountUserId.mockReset();
    mocks.resolveAccountDaemonLogFilePath.mockReset();
    mocks.resolveDaemonLogFilePath.mockReset().mockReturnValue("/profile/logs/system.log");
    mocks.resolveLegacyDaemonLogFilePath.mockReset().mockReturnValue("/profile/logs/daemon.log");
  });

  it("reads the system log from the profile log path", async () => {
    mocks.readFile.mockResolvedValue("system log");

    await expect(createDaemonHost().readLog("system")).resolves.toEqual({ ok: true, content: "system log" });
    expect(mocks.readFile).toHaveBeenCalledWith("/profile/logs/system.log", "utf8");
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it("falls back to the legacy profile log only when system.log is absent", async () => {
    mocks.readFile.mockRejectedValueOnce({ code: "ENOENT" }).mockResolvedValueOnce("legacy log");

    await expect(createDaemonHost().readLog("system")).resolves.toEqual({ ok: true, content: "legacy log" });
    expect(mocks.readFile).toHaveBeenNthCalledWith(1, "/profile/logs/system.log", "utf8");
    expect(mocks.readFile).toHaveBeenNthCalledWith(2, "/profile/logs/daemon.log", "utf8");
  });

  it("reports when no active account is available without reading a log", async () => {
    mocks.readActiveAccountUserId.mockResolvedValue(null);

    await expect(createDaemonHost().readLog("account")).resolves.toEqual({
      ok: false,
      error: "No active account is available for account logs.",
    });
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
