import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExternalAppId } from "../../shared/contracts/externalApps";
import { launchExternalApp, listDetectedExternalAppIds } from "./externalAppLauncher";
import { openExternalUrl } from "./externalUrlLauncher";
import { openInDefaultApplication, openInFileManager } from "./fileManagerLauncher";
import { openWorkspaceEntry } from "./workspaceEntryLauncher";

async function launchPath(
  input:
    | { kind: "system-file-manager"; path: string; isDirectory: boolean }
    | { kind: "external-app"; path: string; appId: ExternalAppId },
) {
  if (input.kind === "system-file-manager") return await openInFileManager(input.path, input.isDirectory);
  return await launchExternalApp(input.path, input.appId);
}

const mocks = vi.hoisted(() => ({
  runCommandForExitCode: vi.fn(),
  shellShowItemInFolder: vi.fn(),
  shellOpenPath: vi.fn(),
  shellOpenExternal: vi.fn(),
}));

vi.mock("../clipboard/process", () => ({
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

  it("opens a workspace entry file in its default application without reveal semantics", async () => {
    resetMocks();
    mocks.shellOpenPath.mockResolvedValue("");

    await openWorkspaceEntry({
      workspaceWorktreePath: "/contexts/task-1/plan.md",
      appId: "system-default",
    });

    expect(mocks.shellOpenPath).toHaveBeenCalledWith("/contexts/task-1/plan.md");
    expect(mocks.shellShowItemInFolder).not.toHaveBeenCalled();
  });

  it("opens a file in its default application without revealing it", async () => {
    resetMocks();
    mocks.shellOpenPath.mockResolvedValue("");

    await openInDefaultApplication("/contexts/task-1/plan.md");

    expect(mocks.shellOpenPath).toHaveBeenCalledWith("/contexts/task-1/plan.md");
    expect(mocks.shellShowItemInFolder).not.toHaveBeenCalled();
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

  it("detects installed macOS external apps without opening them", async () => {
    resetMocks();
    setPlatform("darwin");
    mocks.runCommandForExitCode.mockImplementation(async (command: string[]) => {
      if (command[0] !== "open" || command[1] !== "-Ra") {
        return 1;
      }

      return command[2] === "Cursor" || command[2] === "WebStorm" ? 0 : 1;
    });

    await expect(listDetectedExternalAppIds()).resolves.toEqual(["cursor", "jetbrains-webstorm"]);
    expect(mocks.runCommandForExitCode).toHaveBeenCalledWith(["open", "-Ra", "Cursor"]);
    expect(mocks.runCommandForExitCode).toHaveBeenCalledWith(["open", "-Ra", "WebStorm"]);
  });

  it("skips ambiguous Linux detections for apps that share one launcher command", async () => {
    resetMocks();
    setPlatform("linux");
    mocks.runCommandForExitCode.mockImplementation(async (command: string[]) => {
      if (command[0] !== "which") {
        return 1;
      }

      return command[1] === "idea" ? 0 : 1;
    });

    await expect(listDetectedExternalAppIds()).resolves.toEqual([]);
    expect(mocks.runCommandForExitCode).not.toHaveBeenCalledWith(["which", "idea"]);
  });

  it("does not detect macOS-only apps on Linux", async () => {
    resetMocks();
    setPlatform("linux");
    mocks.runCommandForExitCode.mockImplementation(async (command: string[]) => {
      if (command[0] !== "which") {
        return 1;
      }

      return command[1] === "xed" ? 0 : 1;
    });

    await expect(listDetectedExternalAppIds()).resolves.toEqual([]);
    expect(mocks.runCommandForExitCode).not.toHaveBeenCalledWith(["which", "xed"]);
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
