import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { effectivePath, isCommandAvailable, mergeEnv, resolveExecutable, resolveSpawnCommand } from "./commands";

describe("command helpers", () => {
  test("resolves executables from PATH and relative paths", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-commands-"));
    try {
      const executable = path.join(root, "tool");
      writeFileSync(executable, "#!/bin/sh\nexit 0\n");
      chmodSync(executable, 0o755);
      expect(isCommandAvailable("./tool", root, "")).toBe(true);
      expect(resolveExecutable("tool", root, process.platform, "")).toBe(executable);

      const bin = path.join(root, "bin");
      const relativeExecutable = path.join(bin, "relative-tool");
      mkdirSync(bin);
      writeFileSync(relativeExecutable, "#!/bin/sh\nexit 0\n");
      chmodSync(relativeExecutable, 0o755);
      expect(resolveExecutable("relative-tool", root, process.platform, "bin")).toBe(relativeExecutable);
      expect(isCommandAvailable("missing-tool", root, "bin")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("merges env overrides case-insensitively on Windows", () => {
    const windowsBin = mkdtempSync(path.join(os.tmpdir(), "pi-lsp-commands-win-"));
    try {
      expect(effectivePath({ Path: windowsBin }, "win32")).toBe(windowsBin);
      const merged = mergeEnv({ Path: windowsBin }, "win32");
      expect(Object.entries(merged).filter(([key]) => key.toLowerCase() === "path")).toEqual([["Path", windowsBin]]);
    } finally {
      rmSync(windowsBin, { recursive: true, force: true });
    }
  });

  test("wraps batch commands through cmd.exe on Windows only", () => {
    const shim = "C:\\bin\\language-server.cmd";
    expect(
      resolveSpawnCommand({ command: shim, args: ["--stdio"] }, "win32", "C:\\Windows\\System32\\cmd.exe"),
    ).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", shim, "--stdio"],
    });
    expect(resolveSpawnCommand({ command: "language_server.sh", args: [] }, "linux")).toEqual({
      command: "language_server.sh",
      args: [],
    });
  });
});
