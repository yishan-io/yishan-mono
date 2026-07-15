import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExternalAppId } from "../../shared/contracts/externalApps";
import { launchPath, openExternalUrl } from "./externalAppLauncher";

const mocks = vi.hoisted(() => ({
  runCommandForExitCode: vi.fn(),
  shellShowItemInFolder: vi.fn(),
  shellOpenPath: vi.fn(),
  shellOpenExternal: vi.fn(),
}));

vi.mock("./process", () => ({
  runCommandForExitCode: mocks.runCommandForExitCode,
}));

vi.mock("electron", () => ({
  shell: {
    showItemInFolder: mocks.shellShowItemInFolder,
    openPath: mocks.shellOpenPath,
    openExternal: mocks.shellOpenExternal,
  },
}));

describe("launchPath", () => {
  const originalPlatform = process.platform;

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: platform,
    });
  };

  const resetMocks = () => {
    mocks.runCommandForExitCode.mockReset();
    mocks.shellShowItemInFolder.mockReset();
    mocks.shellOpenPath.mockReset();
    mocks.shellOpenExternal.mockReset();
  };

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it("reveals files in host file manager", async () => {
    resetMocks();

    await launchPath({
      kind: "system-file-manager",
      path: "/tmp/repo/src/index.ts",
      isDirectory: false,
    });

    expect(mocks.shellShowItemInFolder).toHaveBeenCalledWith("/tmp/repo/src/index.ts");
    expect(mocks.shellOpenPath).not.toHaveBeenCalled();
  });

  it("opens directories in host file manager", async () => {
    resetMocks();
    mocks.shellOpenPath.mockResolvedValue("");

    await launchPath({
      kind: "system-file-manager",
      path: "/tmp/repo/src",
      isDirectory: true,
    });

    expect(mocks.shellOpenPath).toHaveBeenCalledWith("/tmp/repo/src");
    expect(mocks.shellShowItemInFolder).not.toHaveBeenCalled();
  });

  it("throws when opening a directory in host file manager fails", async () => {
    resetMocks();
    mocks.shellOpenPath.mockResolvedValue("failed");

    await expect(
      launchPath({
        kind: "system-file-manager",
        path: "/tmp/repo/src",
        isDirectory: true,
      }),
    ).rejects.toThrow("failed");
  });

  it("launches a macOS external app with open -a", async () => {
    resetMocks();
    setPlatform("darwin");
    mocks.runCommandForExitCode.mockResolvedValue(0);

    await launchPath({
      kind: "external-app",
      path: "/tmp/repo",
      appId: "cursor",
    });

    expect(mocks.runCommandForExitCode).toHaveBeenCalledWith(["open", "-a", "Cursor", "/tmp/repo"]);
  });

  it("throws when external-app launch is requested on unsupported platform", async () => {
    resetMocks();
    setPlatform("win32");

    await expect(
      launchPath({
        kind: "external-app",
        path: "C:/repo",
        appId: "cursor",
      }),
    ).rejects.toThrow("not supported on this platform yet");
    expect(mocks.runCommandForExitCode).not.toHaveBeenCalled();
  });

  it("throws when external-app id is unsupported", async () => {
    resetMocks();
    setPlatform("darwin");

    await expect(
      launchPath({
        kind: "external-app",
        path: "/tmp/repo",
        appId: "unknown-app" as ExternalAppId,
      }),
    ).rejects.toThrow("Unsupported external app");
    expect(mocks.runCommandForExitCode).not.toHaveBeenCalled();
  });

  it("throws when all external-app command candidates fail", async () => {
    resetMocks();
    setPlatform("linux");
    mocks.runCommandForExitCode.mockResolvedValue(1);

    await expect(
      launchPath({
        kind: "external-app",
        path: "/tmp/repo",
        appId: "cursor",
      }),
    ).rejects.toThrow("Failed to open path in Cursor");
  });

  it("opens valid external URLs through Electron shell", async () => {
    resetMocks();

    const result = await openExternalUrl("https://yishan.io/docs");

    expect(mocks.shellOpenExternal).toHaveBeenCalledWith("https://yishan.io/docs");
    expect(result).toEqual({ opened: true });
  });

  it("rejects invalid URLs without invoking Electron shell", async () => {
    resetMocks();

    const result = await openExternalUrl("not-a-url");

    expect(mocks.shellOpenExternal).not.toHaveBeenCalled();
    expect(result).toEqual({ opened: false, reason: "invalid-url" });
  });

  it("rejects unsupported URL protocols", async () => {
    resetMocks();

    const result = await openExternalUrl("file:///tmp/private.txt");

    expect(mocks.shellOpenExternal).not.toHaveBeenCalled();
    expect(result).toEqual({ opened: false, reason: "unsupported-protocol" });
  });

  it("returns one failed status when shell.openExternal throws", async () => {
    resetMocks();
    mocks.shellOpenExternal.mockRejectedValueOnce(new Error("boom"));

    const result = await openExternalUrl("https://yishan.io/docs");

    expect(mocks.shellOpenExternal).toHaveBeenCalledWith("https://yishan.io/docs");
    expect(result).toEqual({ opened: false, reason: "open-failed" });
  });
});
