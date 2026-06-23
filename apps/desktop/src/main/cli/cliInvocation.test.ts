import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock("../runtime/environment", () => ({
  isDevMode: () => true,
}));

import { existsSync } from "node:fs";
import { resolveCliInvocation } from "./cliInvocation";

Object.defineProperty(process, "resourcesPath", {
  value: "/Applications/Yishan.app/Contents/Resources",
  writable: true,
});

describe("resolveCliInvocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.YISHAN_CLI_PATH;
    delete process.env.YISHAN_GO_PATH;
    delete process.env.YISHAN_CLI_DEV_DIR;
    delete process.env.VITE_API_BASE_URL;
    (existsSync as Mock).mockReturnValue(false);
  });

  it("prefers an explicit CLI path", () => {
    process.env.YISHAN_CLI_PATH = "/tmp/custom-yishan";

    expect(resolveCliInvocation()).toEqual({
      executablePath: "/tmp/custom-yishan",
      prefixArgs: [],
    });
  });

  it("uses a discovered Go binary in dev mode", () => {
    (existsSync as Mock).mockImplementation((path: string) => {
      return path === "/opt/homebrew/bin/go" || path.endsWith("/apps/cli");
    });

    const invocation = resolveCliInvocation();

    expect(invocation).toEqual({
      executablePath: "/opt/homebrew/bin/go",
      prefixArgs: ["run", "."],
      cwd: expect.stringContaining("/apps/cli"),
    });
  });

  it("adds dev auth flags when requested", () => {
    process.env.VITE_API_BASE_URL = "http://127.0.0.1:8789";
    (existsSync as Mock).mockImplementation((path: string) => {
      return path === "/opt/homebrew/bin/go" || path.endsWith("/apps/cli");
    });

    const invocation = resolveCliInvocation({ includeDevApiBaseUrl: true });

    expect(invocation.prefixArgs).toEqual([
      "run",
      ".",
      "--profile",
      "dev",
      "--api-base-url",
      "http://127.0.0.1:8789",
    ]);
  });

  it("throws a clear error when Go is unavailable in dev mode", () => {
    expect(() => resolveCliInvocation()).toThrow(
      "Go toolchain not found for desktop dev mode. Install Go or set YISHAN_GO_PATH.",
    );
  });
});
