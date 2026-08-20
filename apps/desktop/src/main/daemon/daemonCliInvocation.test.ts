import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ existsSync: vi.fn<(path: string) => boolean>() }));

vi.mock("node:fs", () => ({ existsSync: mocks.existsSync }));
vi.mock("../runtime/environment", () => ({ isDevMode: () => false }));

import { resolveCliInvocation } from "./daemonCliInvocation";

const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalResourcesPath = process.resourcesPath;

describe("resolveCliInvocation", () => {
  beforeEach(() => {
    process.env.PATH = "/restricted/gui/path";
    process.env.HOME = "/test-home";
    process.env.USERPROFILE = "/test-user-profile";
    Object.defineProperty(process, "resourcesPath", { configurable: true, value: "/app/resources" });
    mocks.existsSync.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    Object.defineProperty(process, "resourcesPath", { configurable: true, value: originalResourcesPath });
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
