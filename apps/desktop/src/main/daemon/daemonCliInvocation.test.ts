import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn<(path: string) => boolean>(),
  isDevMode: vi.fn(() => false),
}));

vi.mock("node:fs", () => ({ existsSync: mocks.existsSync }));
vi.mock("../runtime/environment", () => ({ isDevMode: mocks.isDevMode }));

import { resolveCliInvocation, resolveDaemonCliEnvironment } from "./daemonCliInvocation";

const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalResourcesPath = process.resourcesPath;
const originalExecPath = process.execPath;

describe("resolveCliInvocation", () => {
  beforeEach(() => {
    process.env.PATH = "/restricted/gui/path";
    process.env.HOME = "/test-home";
    process.env.USERPROFILE = "/test-user-profile";
    Object.defineProperty(process, "resourcesPath", { configurable: true, value: "/app/resources" });
    mocks.existsSync.mockReset().mockReturnValue(false);
    mocks.isDevMode.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.env.PATH = originalPath;
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    Object.defineProperty(process, "resourcesPath", { configurable: true, value: originalResourcesPath });
    Object.defineProperty(process, "execPath", { configurable: true, value: originalExecPath });
  });

  it("passes the Electron executable and packaged DSH resource to the daemon", () => {
    Object.defineProperty(process, "execPath", { configurable: true, value: "/app/Yishan" });
    vi.stubEnv("YISHAN_DSH_ENABLED", "true");

    expect(resolveDaemonCliEnvironment()).toMatchObject({
      YISHAN_DAEMON_DSH_ENABLED: "true",
      YISHAN_DAEMON_DSH_NODE_PATH: "/app/Yishan",
      YISHAN_DAEMON_DSH_RUNTIME_PATH: "/app/resources/dsh-runtime.mjs",
    });
  });

  it("uses the built development DSH resource in desktop development mode", () => {
    mocks.isDevMode.mockReturnValue(true);
    vi.spyOn(process, "cwd").mockReturnValue("/repo/apps/desktop");

    expect(resolveDaemonCliEnvironment()).toMatchObject({
      YISHAN_DAEMON_DSH_RUNTIME_PATH: "/repo/apps/desktop/dist/resources/dsh-runtime.mjs",
    });
  });

  it("uses a common external install path when a GUI process PATH omits it", () => {
    const commonPath =
      process.platform === "win32" ? resolve("/test-home", ".local", "bin", "yishan.exe") : "/opt/homebrew/bin/yishan";
    mocks.existsSync.mockImplementation((path) => path === commonPath);

    expect(resolveCliInvocation()).toEqual({ executablePath: commonPath, prefixArgs: [] });
  });

  it("prefers an executable found on PATH over common external locations", () => {
    const binary = process.platform === "win32" ? "yishan.exe" : "yishan";
    const pathCli = resolve("/restricted/gui/path", binary);
    mocks.existsSync.mockImplementation((path) => path === pathCli);

    expect(resolveCliInvocation()).toEqual({ executablePath: pathCli, prefixArgs: [] });
  });
});
