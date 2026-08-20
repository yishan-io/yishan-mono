import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { getErrorMessage } from "../../shared/errors/getErrorMessage";
import { isDevMode } from "../runtime/environment";
import { resolveCliProfileName } from "./daemonEndpoint";
export type CliCommandResult = { exitCode: number | null; stdout: string; stderr: string; error?: string };
export type CliCommandRunner = (args: string[]) => Promise<CliCommandResult>;
type Invocation = { executablePath: string; prefixArgs: string[]; cwd?: string };
const timeoutMs = 30_000;
const terminateGraceMs = 1_000;
const forceKillWaitMs = 1_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function terminateChildProcess(child: ChildProcess): Promise<void> {
  const waitForExit = new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
  });
  const termSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGTERM";
  child.kill(termSignal);
  const didExitAfterTerminate = await Promise.race([
    waitForExit.then(() => true),
    delay(terminateGraceMs).then(() => false),
  ]);
  if (didExitAfterTerminate) return;

  const killSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGKILL";
  child.kill(killSignal);
  await Promise.race([waitForExit, delay(forceKillWaitMs)]);
}
/** Returns the first existing candidate path. */
export function firstExistingPath(candidates: Array<string | undefined>): string | undefined {
  return candidates.find((candidate) => Boolean(candidate?.trim() && existsSync(candidate.trim())))?.trim();
}
function resolveDevCliDir(): string | undefined {
  return firstExistingPath([
    process.env.YISHAN_CLI_DEV_DIR,
    resolve(process.cwd(), "..", "cli"),
    resolve(process.cwd(), "apps", "cli"),
    resolve(process.cwd(), "..", "apps", "cli"),
    resolve(process.cwd(), "..", "..", "apps", "cli"),
  ]);
}
/** Resolves the executable and arguments used to invoke the daemon CLI. */
export function resolveCliInvocation(): Invocation {
  const explicit = process.env.YISHAN_CLI_PATH?.trim();
  if (explicit) return { executablePath: explicit, prefixArgs: [] };
  if (isDevMode()) return { executablePath: "go", prefixArgs: ["run", "."], cwd: resolveDevCliDir() };
  const binary = process.platform === "win32" ? "yishan.exe" : "yishan";
  const bundled = process.resourcesPath;
  const externalPathCandidates = (process.env.PATH || "")
    .split(delimiter)
    .map((dir) => dir && resolve(dir, binary))
    .filter((path) => !path.startsWith(bundled));
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const commonExternalCandidates =
    process.platform === "win32"
      ? [resolve(home, "AppData", "Local", "Yishan", "bin", binary), resolve(home, ".local", "bin", binary)]
      : [resolve(home, ".local", "bin", binary), `/usr/local/bin/${binary}`, `/opt/homebrew/bin/${binary}`];
  const externalCli = firstExistingPath([...externalPathCandidates, ...commonExternalCandidates]);
  if (externalCli) return { executablePath: externalCli, prefixArgs: [] };
  const bundledPath = resolve(bundled, binary);
  return existsSync(bundledPath)
    ? { executablePath: bundledPath, prefixArgs: [] }
    : { executablePath: "go", prefixArgs: ["run", "."], cwd: resolveDevCliDir() };
}
export function buildDaemonStartArgs(): string[] {
  return ["daemon", "start", "--profile", resolveCliProfileName()];
}
export function buildDaemonStopArgs(): string[] {
  return ["daemon", "stop", "--profile", resolveCliProfileName()];
}
/** Runs one CLI command and captures output, timing out safely. */
export async function runCliCommand(args: string[]): Promise<CliCommandResult> {
  const invocation = resolveCliInvocation();
  return await new Promise((resolveResult) => {
    const child = spawn(invocation.executablePath, [...invocation.prefixArgs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd: invocation.cwd,
    });
    let stdout = "";
    let stderr = "";
    let didSettle = false;
    const complete = (result: CliCommandResult) => {
      if (!didSettle) {
        didSettle = true;
        resolveResult(result);
      }
    };
    const timer = setTimeout(() => {
      void terminateChildProcess(child).finally(() => {
        complete({ exitCode: null, stdout, stderr, error: `CLI command timed out after ${timeoutMs}ms` });
      });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      complete({ exitCode: null, stdout, stderr, error: getErrorMessage(error) });
    });
    child.once("exit", (exitCode) => {
      clearTimeout(timer);
      complete({ exitCode, stdout, stderr });
    });
  });
}
