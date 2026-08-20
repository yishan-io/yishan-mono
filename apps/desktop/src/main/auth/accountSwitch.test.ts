import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginAndRestartDaemon } from "./accountSwitch";

const mocks = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock("./cliAuth", () => ({ login: mocks.login }));

describe("loginAndRestartDaemon", () => {
  beforeEach(() => {
    mocks.login.mockReset();
  });

  it("restarts the daemon after a completed authenticated login", async () => {
    mocks.login.mockResolvedValue({ authenticated: true, skipped: false });
    const restartDaemon = vi.fn(async () => undefined);

    await expect(loginAndRestartDaemon(restartDaemon)).resolves.toEqual({ authenticated: true, skipped: false });
    expect(restartDaemon).toHaveBeenCalledTimes(1);
  });

  it("does not restart for skipped or unauthenticated login results", async () => {
    const restartDaemon = vi.fn(async () => undefined);
    mocks.login.mockResolvedValueOnce({ authenticated: true, skipped: true });
    await loginAndRestartDaemon(restartDaemon);
    mocks.login.mockResolvedValueOnce({ authenticated: false, skipped: false });
    await loginAndRestartDaemon(restartDaemon);

    expect(restartDaemon).not.toHaveBeenCalled();
  });

  it("preserves a successful login when daemon restart fails", async () => {
    mocks.login.mockResolvedValue({ authenticated: true, skipped: false });
    const restartDaemon = vi.fn(async () => Promise.reject(new Error("daemon unavailable")));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(loginAndRestartDaemon(restartDaemon)).resolves.toEqual({ authenticated: true, skipped: false });
    expect(warning).toHaveBeenCalledWith("Daemon restart after login failed:", "daemon unavailable");
  });
});
