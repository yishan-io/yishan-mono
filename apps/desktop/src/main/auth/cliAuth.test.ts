import { describe, expect, it, vi } from "vitest";
import { getAuthStatus, login } from "./cliAuth";

describe("cliAuth", () => {
  it("returns authenticated status when CLI status reports signed-in state", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{"authenticated":true,"expiresAt":"2030-01-01T00:00:00.000Z"}', stderr: "" });

    const status = await getAuthStatus({ run });

    expect(run).toHaveBeenCalledWith(["whoami"]);
    expect(status).toEqual({ authenticated: true, expiresAt: "2030-01-01T00:00:00.000Z" });
  });

  it("treats successful object responses as authenticated when flag is omitted", async () => {
    const run = vi.fn().mockResolvedValueOnce({ exitCode: 0, stdout: '{"id":"user-1","email":"a@b.com"}', stderr: "" });

    const status = await getAuthStatus({ run });

    expect(status).toEqual({ authenticated: true });
  });

  it("returns signed-out status when CLI status exits non-zero", async () => {
    const run = vi.fn().mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "not logged in" });

    const status = await getAuthStatus({ run });

    expect(status).toEqual({ authenticated: false });
  });

  it("skips login command when status already authenticated", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{"authenticated":true}', stderr: "" });

    const result = await login({ run });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ authenticated: true, skipped: true });
  });

  it("runs login command then re-checks status when signed out", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{"authenticated":true}', stderr: "" });

    const result = await login({ run });

    expect(run).toHaveBeenNthCalledWith(1, ["whoami"]);
    expect(run).toHaveBeenNthCalledWith(2, ["login"]);
    expect(run).toHaveBeenNthCalledWith(3, ["whoami"]);
    expect(result).toEqual({ authenticated: true, skipped: false });
  });
});
