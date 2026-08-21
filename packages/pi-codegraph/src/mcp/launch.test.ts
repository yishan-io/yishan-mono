import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { defaultCodeGraphLauncher, normalizeProjectPath, resolveProjectDirectory } from "./launch";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

class SpawnedProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 123;
  readonly exitCode: number | null = null;
  readonly signalCode: NodeJS.Signals | null = null;
}

describe("project path resolution", () => {
  it("uses the Pi context cwd when projectPath is omitted", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-codegraph-path-"));
    try {
      await expect(resolveProjectDirectory(undefined, root)).resolves.toBe(path.resolve(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires accessible absolute directories", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-codegraph-path-"));
    const file = path.join(root, "file");
    writeFileSync(file, "x");
    await expect(resolveProjectDirectory("relative", root)).rejects.toThrow(/absolute/);
    await expect(resolveProjectDirectory("", root)).rejects.toThrow(/absolute/);
    await expect(resolveProjectDirectory(file, root)).rejects.toThrow(/directory/);
    await expect(resolveProjectDirectory(path.join(root, "missing"), root)).rejects.toThrow(/accessible/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects an already-aborted resolution", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "pi-codegraph-path-"));
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(resolveProjectDirectory(root, root, controller.signal)).rejects.toThrow(/aborted/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("launches the Windows npm .cmd shim through cmd.exe", async () => {
    const child = new SpawnedProcess();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => child.emit("spawn"));
      return child as never;
    });
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    if (!platform) throw new Error("Expected process.platform descriptor.");
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    try {
      await defaultCodeGraphLauncher.launch(String.raw`C:\work\project`);
      expect(spawnMock).toHaveBeenCalledWith(
        "cmd.exe",
        ["/d", "/s", "/c", "codegraph", "serve", "--mcp", "--path", String.raw`C:\work\project`],
        expect.objectContaining({ detached: false, windowsHide: true }),
      );
    } finally {
      Object.defineProperty(process, "platform", platform);
      spawnMock.mockReset();
    }
  });

  it("normalizes Windows separators and drive paths before validation", () => {
    expect(normalizeProjectPath("C:\\work\\project", "win32")).toBe("C:\\work\\project");
    expect(normalizeProjectPath("/work/project", "win32")).toBe("\\work\\project");
  });
});
