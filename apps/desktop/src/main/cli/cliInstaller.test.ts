import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  lstat: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readlink: vi.fn(),
  symlink: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  constants: { X_OK: 1 },
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

import { existsSync } from "node:fs";
import { access, lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { getDesktopCliInstallStatus, installDesktopCli, uninstallDesktopCli } from "./cliInstaller";

Object.defineProperty(process, "resourcesPath", {
  value: "/Applications/Yishan.app/Contents/Resources",
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
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

  it("detects a symlink to the bundled CLI as managed install", async () => {
    (lstat as Mock).mockResolvedValue({ isSymbolicLink: () => true, isFile: () => false });
    (readlink as Mock).mockResolvedValue("/Applications/Yishan.app/Contents/Resources/yishan");
    (access as Mock).mockResolvedValue(undefined);

    const status = await getDesktopCliInstallStatus();

    expect(status.isManagedInstall).toBe(true);
    expect(status.isAvailableInPath).toBe(true);
  });

  it("does not treat a real binary as managed install", async () => {
    (lstat as Mock).mockResolvedValue({ isSymbolicLink: () => false, isFile: () => true });
    (access as Mock).mockResolvedValue(undefined);

    const status = await getDesktopCliInstallStatus();

    expect(status.isManagedInstall).toBe(false);
    expect(status.isAvailableInPath).toBe(true);
  });

  it("detects a binary found on PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/usr/local/bin:/usr/bin";
    (existsSync as Mock).mockImplementation((path: string) => path === "/usr/local/bin/yishan");
    (access as Mock).mockImplementation((path: string) => {
      if (path === "/usr/local/bin/yishan") {
        return Promise.resolve(undefined);
      }
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
  it("creates a symlink to the bundled CLI", async () => {
    (existsSync as Mock).mockImplementation(
      (path: string) => path === "/Applications/Yishan.app/Contents/Resources/yishan",
    );
    (lstat as Mock).mockResolvedValue({ isSymbolicLink: () => true, isFile: () => false });
    (readlink as Mock).mockResolvedValue("/Applications/Yishan.app/Contents/Resources/yishan");
    (access as Mock).mockResolvedValue(undefined);

    await installDesktopCli();

    expect(mkdir).toHaveBeenCalledWith("/home/testuser/.local/bin", { recursive: true });
    expect(unlink).toHaveBeenCalledWith("/home/testuser/.local/bin/yishan");
    expect(symlink).toHaveBeenCalledWith(
      "/Applications/Yishan.app/Contents/Resources/yishan",
      "/home/testuser/.local/bin/yishan",
    );
  });

  it("throws when the bundled CLI binary is missing", async () => {
    (existsSync as Mock).mockReturnValue(false);

    await expect(installDesktopCli()).rejects.toThrow("Bundled CLI binary is not available.");
  });
});

describe("uninstallDesktopCli", () => {
  it("removes the binary at the install path", async () => {
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    await uninstallDesktopCli();

    expect(unlink).toHaveBeenCalledWith("/home/testuser/.local/bin/yishan");
  });

  it("ignores ENOENT when binary does not exist", async () => {
    (unlink as Mock).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    await expect(uninstallDesktopCli()).resolves.toBeDefined();
  });

  it("rethrows non-ENOENT errors", async () => {
    (unlink as Mock).mockRejectedValue(Object.assign(new Error("EPERM"), { code: "EPERM" }));
    (lstat as Mock).mockRejectedValue(new Error("ENOENT"));
    (access as Mock).mockRejectedValue(new Error("ENOENT"));

    await expect(uninstallDesktopCli()).rejects.toThrow("EPERM");
  });
});
