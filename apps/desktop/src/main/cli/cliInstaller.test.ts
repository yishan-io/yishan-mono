import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  lstat: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readlink: vi.fn(),
  rename: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:fs
vi.mock("node:fs", () => ({
  constants: { X_OK: 1 },
  existsSync: vi.fn().mockReturnValue(false),
}));

// Mock node:child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Mock node:os
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

import { access, lstat, readlink, rm, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDesktopCliInstallStatus, installDesktopCli, uninstallDesktopCli } from "./cliInstaller";

// Stub process.resourcesPath for getBundledCliPath().
Object.defineProperty(process, "resourcesPath", {
  value: "/Applications/Yishan.app/Contents/Resources",
  writable: true,
});

// Helper: make execFile behave like promisify(execFile) expects.
function mockExecFileSuccess() {
  (execFile as unknown as Mock).mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: "", stderr: "" });
    },
  );
}

function mockExecFileFailure(errorMessage: string) {
  (execFile as unknown as Mock).mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => {
      cb(new Error(errorMessage));
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: nothing exists.
  (existsSync as Mock).mockReturnValue(false);
});

describe("getDesktopCliInstallStatus", () => {
  it("returns not available when nothing is installed", async () => {
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    const status = await getDesktopCliInstallStatus();

    expect(status.isAvailableInPath).toBe(false);
    expect(status.isManagedInstall).toBe(false);
    expect(status.resolvedPath).toBeUndefined();
    expect(status.installPath).toBe("/home/testuser/.local/bin/yishan");
    expect(status.bundledCliPath).toBe("/Applications/Yishan.app/Contents/Resources/yishan");
  });

  it("detects a real binary at the install path as managed install", async () => {
    (lstat as Mock).mockResolvedValue({ isFile: () => true, isSymbolicLink: () => false });
    (access as Mock).mockResolvedValue(undefined);

    const status = await getDesktopCliInstallStatus();

    expect(status.isManagedInstall).toBe(true);
    expect(status.isAvailableInPath).toBe(true);
  });

  it("does not treat a symlink as managed install", async () => {
    (lstat as Mock).mockResolvedValue({ isFile: () => false, isSymbolicLink: () => true });
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    const status = await getDesktopCliInstallStatus();

    expect(status.isManagedInstall).toBe(false);
  });

  it("detects a binary found on PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/usr/local/bin:/usr/bin";
    (existsSync as Mock).mockImplementation((p: string) => p === "/usr/local/bin/yishan");
    (access as Mock).mockImplementation((p: string) => {
      if (p === "/usr/local/bin/yishan") return Promise.resolve(undefined);
      return Promise.reject(new Error("ENOENT"));
    });
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));

    const status = await getDesktopCliInstallStatus();

    expect(status.isAvailableInPath).toBe(true);
    expect(status.resolvedPath).toBe("/usr/local/bin/yishan");

    process.env.PATH = originalPath;
  });
});

describe("installDesktopCli", () => {
  it("cleans up old symlink before install", async () => {
    // Simulate old symlink pointing into app bundle.
    (lstat as Mock).mockResolvedValue({ isSymbolicLink: () => true, isFile: () => false });
    (readlink as Mock).mockResolvedValue("/Applications/Yishan.app/Contents/Resources/yishan");
    // No existing CLI on PATH.
    (existsSync as Mock).mockReturnValue(false);
    mockExecFileSuccess();

    // Will throw because install script doesn't actually run in test,
    // but the symlink cleanup should happen first.
    try {
      await installDesktopCli();
    } catch {
      // Expected — install script fails in test.
    }

    expect(unlink).toHaveBeenCalledWith("/home/testuser/.local/bin/yishan");
  });

  it("uses self-update when CLI is already installed", async () => {
    // Simulate existing CLI at /usr/local/bin/yishan.
    (existsSync as Mock).mockImplementation((p: string) => p === "/usr/local/bin/yishan");
    // No old symlink.
    (lstat as Mock).mockResolvedValue({ isSymbolicLink: () => false, isFile: () => true });
    (access as Mock).mockResolvedValue(undefined);
    mockExecFileSuccess();

    await installDesktopCli();

    // First call should be self-update.
    expect(execFile).toHaveBeenCalledWith(
      "/usr/local/bin/yishan",
      ["self-update", "--force"],
      expect.objectContaining({ timeout: 60_000 }),
      expect.any(Function),
    );
  });

  it("falls back to install script when self-update fails (old version)", async () => {
    // Simulate existing CLI at /usr/local/bin/yishan.
    (existsSync as Mock).mockImplementation((p: string) => p === "/usr/local/bin/yishan");
    // No old symlink.
    (lstat as Mock).mockResolvedValue({ isSymbolicLink: () => false, isFile: () => true });
    (access as Mock).mockResolvedValue(undefined);

    // First call (self-update) fails, second call (install script) succeeds.
    let callCount = 0;
    (execFile as unknown as Mock).mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
        callCount++;
        if (callCount === 1) {
          cb(new Error("unknown command: self-update"));
        } else {
          cb(null, { stdout: "", stderr: "" });
        }
      },
    );

    await installDesktopCli();

    // Should have been called twice: self-update then install script.
    expect(execFile).toHaveBeenCalledTimes(2);
    // Second call should be the install script targeting the same directory.
    expect(execFile).toHaveBeenLastCalledWith(
      "sh",
      ["-c", expect.stringContaining("--bin-dir \"/usr/local/bin\"")],
      expect.objectContaining({ timeout: 120_000 }),
      expect.any(Function),
    );
  });

  it("uses install script for fresh install when no CLI exists", async () => {
    (existsSync as Mock).mockReturnValue(false);
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));
    mockExecFileSuccess();

    await installDesktopCli();

    // Should call install script with default bin dir.
    expect(execFile).toHaveBeenCalledWith(
      "sh",
      ["-c", expect.stringContaining("--bin-dir \"/home/testuser/.local/bin\"")],
      expect.objectContaining({ timeout: 120_000 }),
      expect.any(Function),
    );
  });

  it("throws when install script fails", async () => {
    (existsSync as Mock).mockReturnValue(false);
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    mockExecFileFailure("curl: not found");

    await expect(installDesktopCli()).rejects.toThrow("Install script failed");
  });

  it("skips bundled CLI path when searching for existing CLI", async () => {
    // Only the bundled path exists, nothing else.
    (existsSync as Mock).mockImplementation(
      (p: string) => p === "/Applications/Yishan.app/Contents/Resources/yishan",
    );
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    mockExecFileSuccess();

    await installDesktopCli();

    // Should use install script (not self-update) since bundled is skipped.
    expect(execFile).toHaveBeenCalledWith(
      "sh",
      ["-c", expect.stringContaining("install.sh")],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("detects CLI installed via Homebrew at /opt/homebrew/bin", async () => {
    (existsSync as Mock).mockImplementation((p: string) => p === "/opt/homebrew/bin/yishan");
    (lstat as Mock).mockResolvedValue({ isSymbolicLink: () => false, isFile: () => true });
    (access as Mock).mockResolvedValue(undefined);
    mockExecFileSuccess();

    await installDesktopCli();

    expect(execFile).toHaveBeenCalledWith(
      "/opt/homebrew/bin/yishan",
      ["self-update", "--force"],
      expect.objectContaining({ timeout: 60_000 }),
      expect.any(Function),
    );
  });
});

describe("uninstallDesktopCli", () => {
  it("removes the binary at the install path", async () => {
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    await uninstallDesktopCli();

    expect(rm).toHaveBeenCalledWith("/home/testuser/.local/bin/yishan", { force: true });
  });

  it("ignores ENOENT when binary does not exist", async () => {
    (rm as Mock).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    await expect(uninstallDesktopCli()).resolves.toBeDefined();
  });

  it("rethrows non-ENOENT errors", async () => {
    (rm as Mock).mockRejectedValue(Object.assign(new Error("EPERM"), { code: "EPERM" }));
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    await expect(uninstallDesktopCli()).rejects.toThrow("EPERM");
  });
});
