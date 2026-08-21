import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { CodeGraphLauncher, LaunchedCodeGraph } from "./client";

/** Normalizes a project path using the target platform's path semantics. */
export function normalizeProjectPath(projectPath: string, platform: NodeJS.Platform = process.platform): string {
  return (platform === "win32" ? path.win32 : path).normalize(projectPath.trim());
}

/** Resolves an accessible absolute project directory without consulting process.cwd(). */
export async function resolveProjectDirectory(
  projectPath: string | undefined,
  contextCwd: string,
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);
  const selectedPath = projectPath ?? contextCwd;
  const pathApi = process.platform === "win32" ? path.win32 : path;
  const normalizedPath = normalizeProjectPath(selectedPath);
  if (!pathApi.isAbsolute(normalizedPath)) throw new Error(`CodeGraph project path must be absolute: ${selectedPath}`);
  try {
    await awaitWithAbort(access(normalizedPath, constants.R_OK | constants.X_OK), signal);
    if (!(await awaitWithAbort(stat(normalizedPath), signal)).isDirectory()) throw new Error("not a directory");
  } catch {
    throwIfAborted(signal);
    throw new Error(`CodeGraph project path must be an accessible directory: ${normalizedPath}`);
  }
  throwIfAborted(signal);
  return normalizedPath;
}

/** Launches `codegraph serve --mcp` for one resolved project directory. */
export const defaultCodeGraphLauncher: CodeGraphLauncher = {
  async launch(projectPath: string): Promise<LaunchedCodeGraph> {
    const codeGraphArgs = ["serve", "--mcp", "--path", projectPath];
    const isWindows = process.platform === "win32";
    const child = spawn(
      isWindows ? "cmd.exe" : "codegraph",
      isWindows ? ["/d", "/s", "/c", "codegraph", ...codeGraphArgs] : codeGraphArgs,
      {
        cwd: projectPath,
        detached: !isWindows,
        stdio: "pipe",
        windowsHide: true,
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    return createLaunchedProcess(child);
  },
};

function createLaunchedProcess(child: ChildProcessWithoutNullStreams): LaunchedCodeGraph {
  return {
    get isClosed() {
      return child.exitCode !== null || child.signalCode !== null;
    },
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    on(event, listener) {
      child.on(event, listener);
    },
    off(event, listener) {
      child.off(event, listener);
    },
    async terminate() {
      if (process.platform === "win32" && child.pid) {
        if (!(await runTaskKill(child.pid, false))) child.kill("SIGTERM");
      } else if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    },
    async forceTerminate() {
      if (process.platform === "win32" && child.pid) {
        if (!(await runTaskKill(child.pid, true))) child.kill("SIGKILL");
      } else if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    },
  };
}

const TASKKILL_TIMEOUT_MS = 1_000;

function runTaskKill(pid: number, force: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/pid", String(pid), "/T", ...(force ? ["/F"] : [])], { windowsHide: true });
    let hasSettled = false;
    const finish = (didSucceed: boolean) => {
      if (hasSettled) return;
      hasSettled = true;
      clearTimeout(timeout);
      resolve(didSucceed);
    };
    const timeout = setTimeout(() => {
      taskkill.kill("SIGKILL");
      finish(false);
    }, TASKKILL_TIMEOUT_MS);
    taskkill.once("close", (code) => finish(code === 0));
    taskkill.once("error", () => finish(false));
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("CodeGraph MCP session aborted.");
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error("CodeGraph MCP session aborted."));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("CodeGraph MCP session aborted."));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
