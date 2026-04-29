import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { isDevMode } from "../runtime/environment";

const DAEMON_START_ARGS = ["daemon", "start", "--jwt-required=false"];
const DAEMON_STOP_ARGS = ["daemon", "stop"];
const DAEMON_STATE_FILE_NAME = "daemon.state.json";
const DAEMON_ID_FILE_NAME = "daemon.id";
const DAEMON_HEALTH_RETRY_COUNT = 24;
const DAEMON_HEALTH_RETRY_DELAY_MS = 50;
const DAEMON_PRECHECK_HEALTH_RETRY_COUNT = 1;
const DAEMON_PRECHECK_HEALTH_RETRY_DELAY_MS = 20;
const CLI_COMMAND_TIMEOUT_MS = 30_000;
const DEV_DAEMON_STOP_TIMEOUT_MS = 5_000;

type CliCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

type CliCommandRunner = (args: string[]) => Promise<CliCommandResult>;

type CliInvocation = {
  executablePath: string;
  prefixArgs: string[];
  cwd?: string;
};

type DaemonLogger = Pick<Console, "warn">;

type DaemonManagerOptions = {
  run?: CliCommandRunner;
  logger?: DaemonLogger;
  fetch?: typeof fetch;
};

type DaemonInfo = {
  version: string;
  daemonId: string;
  wsUrl: string;
};

type DaemonState = {
  host: string;
  port: number;
};

function firstExistingPath(candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) {
      continue;
    }
    if (existsSync(value)) {
      return value;
    }
  }

  return undefined;
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

function resolveCliProfileName(): string {
  if (isDevMode()) {
    return "dev";
  }

  return process.env.YISHAN_PROFILE?.trim() || "default";
}

function resolveDaemonStateFilePath(): string {
  return resolve(homedir(), ".yishan", "profiles", resolveCliProfileName(), DAEMON_STATE_FILE_NAME);
}

function resolveDaemonIdFilePath(): string {
  return resolve(homedir(), ".yishan", "profiles", resolveCliProfileName(), DAEMON_ID_FILE_NAME);
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readPersistedDaemonId(): Promise<string> {
  try {
    const raw = await readFile(resolveDaemonIdFilePath(), "utf8");
    return raw.trim();
  } catch {
    return "";
  }
}

async function readDaemonState(): Promise<DaemonState> {
  const stateFilePath = resolveDaemonStateFilePath();
  let stateRaw: string;
  try {
    stateRaw = await readFile(stateFilePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(`daemon state file not found: ${stateFilePath}`);
    }
    throw error;
  }

  const parsed = JSON.parse(stateRaw) as { host?: unknown; port?: unknown };
  const host = typeof parsed.host === "string" ? parsed.host.trim() : "";
  const port = typeof parsed.port === "number" ? parsed.port : 0;
  if (!host || port <= 0) {
    throw new Error("daemon state is invalid");
  }

  return { host, port };
}

function resolveDaemonWsUrlFromHealthUrl(healthUrl: string): string {
  try {
    const parsed = new URL(healthUrl);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}/ws`;
  } catch {
    return "";
  }
}

async function resolveDaemonHealthUrl(): Promise<string> {
  const explicitHealthUrl = process.env.YISHAN_DAEMON_HEALTH_URL?.trim();
  if (explicitHealthUrl) {
    return explicitHealthUrl;
  }

  const explicitWsUrl = process.env.YISHAN_DAEMON_WS_URL?.trim();
  if (explicitWsUrl) {
    try {
      const parsed = new URL(explicitWsUrl);
      const protocol = parsed.protocol === "wss:" ? "https:" : "http:";
      return `${protocol}//${parsed.host}/healthz`;
    } catch {
      // fall through to daemon state file
    }
  }

  const state = await readDaemonState();
  return `http://${state.host}:${state.port}/healthz`;
}

async function resolveDaemonWebSocketUrl(): Promise<string> {
  const explicitWsUrl = process.env.YISHAN_DAEMON_WS_URL?.trim();
  if (explicitWsUrl) {
    return explicitWsUrl;
  }

  const explicitHealthUrl = process.env.YISHAN_DAEMON_HEALTH_URL?.trim();
  if (explicitHealthUrl) {
    const inferredWsUrl = resolveDaemonWsUrlFromHealthUrl(explicitHealthUrl);
    if (inferredWsUrl) {
      return inferredWsUrl;
    }
  }

  const state = await readDaemonState();
  return `ws://${state.host}:${state.port}/ws`;
}

function resolveCliInvocation(): CliInvocation {
  const explicitCliPath = process.env.YISHAN_CLI_PATH?.trim();
  if (explicitCliPath) {
    return {
      executablePath: explicitCliPath,
      prefixArgs: [],
    };
  }

  if (isDevMode()) {
    const cliDir = resolveDevCliDir();

    return {
      executablePath: "go",
      prefixArgs: ["run", ".", "--profile", "dev"],
      cwd: cliDir,
    };
  }

  const bundledCliName = process.platform === "win32" ? "yishan.exe" : "yishan";
  const bundledCliPath = resolve(process.resourcesPath, bundledCliName);
  if (!existsSync(bundledCliPath)) {
    const cliDir = resolveDevCliDir();

    return {
      executablePath: "go",
      prefixArgs: ["run", ".", "--profile", "dev"],
      cwd: cliDir,
    };
  }

  return {
    executablePath: bundledCliPath,
    prefixArgs: [],
  };
}

async function runCliCommand(args: string[]): Promise<CliCommandResult> {
  const invocation = resolveCliInvocation();

  return await new Promise<CliCommandResult>((resolvePromise) => {
    let settled = false;
    const resolveOnce = (value: CliCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise(value);
    };

    const child = spawn(invocation.executablePath, [...invocation.prefixArgs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd: invocation.cwd,
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolveOnce({
        exitCode: null,
        stdout,
        stderr,
        error: `CLI command timed out after ${CLI_COMMAND_TIMEOUT_MS}ms`,
      });
    }, CLI_COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolveOnce({
        exitCode: null,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : "Failed to run CLI command",
      });
    });

    child.on("exit", (exitCode) => {
      clearTimeout(timeout);
      resolveOnce({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

function formatCliFailure(action: "start" | "stop", result: CliCommandResult): string {
  const details = [result.stderr, result.stdout].join("\n").trim();
  if (details) {
    return `Failed to ${action} daemon: ${details}`;
  }

  if (typeof result.exitCode === "number") {
    return `Failed to ${action} daemon: CLI command exited with code ${result.exitCode}`;
  }

  return `Failed to ${action} daemon: CLI command exited unexpectedly`;
}

function isDaemonNotRunning(details: string): boolean {
  return details.toLowerCase().includes("daemon is not running");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function formatDevDaemonExitFailure(exitCode: number | null, signal: NodeJS.Signals | null, output: string): string {
  const status = typeof exitCode === "number" ? `code ${exitCode}` : `signal ${signal ?? "unknown"}`;
  const details = output.trim();
  if (!details) {
    return `dev daemon exited before becoming healthy (${status})`;
  }

  return `dev daemon exited before becoming healthy (${status}): ${details}`;
}

export class DaemonManager {
  private readonly run: CliCommandRunner;
  private readonly logger: DaemonLogger;
  private readonly fetchFn: typeof fetch;
  private ensureStartedInFlight: Promise<void> | null = null;
  private devDaemonChild: ChildProcess | null = null;

  constructor(options?: DaemonManagerOptions) {
    this.run = options?.run ?? runCliCommand;
    this.logger = options?.logger ?? console;
    this.fetchFn = options?.fetch ?? fetch;
  }

  private async waitForHealthy(options?: { retryCount?: number; retryDelayMs?: number }): Promise<void> {
    const retryCount = Math.max(0, Math.floor(options?.retryCount ?? DAEMON_HEALTH_RETRY_COUNT));
    const retryDelayMs = Math.max(0, Math.floor(options?.retryDelayMs ?? DAEMON_HEALTH_RETRY_DELAY_MS));
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const url = await resolveDaemonHealthUrl();
        const response = await this.fetchFn(url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          return;
        }

        lastError = new Error(`daemon health check failed: HTTP ${response.status}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("daemon health check failed");
      }

      if (attempt < retryCount) {
        await delay(retryDelayMs);
      }
    }

    throw lastError ?? new Error("daemon failed health checks after start");
  }

  private async startDevForegroundDaemon(): Promise<void> {
    if (this.devDaemonChild && !this.devDaemonChild.killed) {
      return;
    }

    const invocation = resolveCliInvocation();
    let output = "";
    const child = spawn(invocation.executablePath, [...invocation.prefixArgs, "daemon", "run", "--jwt-required=false"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd: invocation.cwd,
    });

    this.devDaemonChild = child;
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });

    const exitBeforeHealthy = new Promise<never>((_, reject) => {
      child.once("error", (error) => {
        reject(error);
      });
      child.once("exit", (exitCode, signal) => {
        reject(new Error(formatDevDaemonExitFailure(exitCode, signal, output)));
      });
    });

    child.once("exit", () => {
      if (this.devDaemonChild === child) {
        this.devDaemonChild = null;
      }
    });

    await Promise.race([this.waitForHealthy(), exitBeforeHealthy]);
  }

  private async stopDevForegroundDaemon(): Promise<boolean> {
    const child = this.devDaemonChild;
    if (!child) {
      return false;
    }

    this.devDaemonChild = null;
    if (child.killed || child.exitCode !== null || child.signalCode !== null) {
      return true;
    }

    const waitForExit = new Promise<void>((resolvePromise) => {
      child.once("exit", () => {
        resolvePromise();
      });
    });

    child.kill("SIGTERM");
    await Promise.race([waitForExit, delay(DEV_DAEMON_STOP_TIMEOUT_MS)]);
    return true;
  }

  async ensureStarted(): Promise<void> {
    if (this.ensureStartedInFlight) {
      return await this.ensureStartedInFlight;
    }

    const task = this.ensureStartedInternal();
    this.ensureStartedInFlight = task;
    try {
      await task;
    } finally {
      if (this.ensureStartedInFlight === task) {
        this.ensureStartedInFlight = null;
      }
    }
  }

  private async ensureStartedInternal(): Promise<void> {
    try {
      await this.waitForHealthy({
        retryCount: DAEMON_PRECHECK_HEALTH_RETRY_COUNT,
        retryDelayMs: DAEMON_PRECHECK_HEALTH_RETRY_DELAY_MS,
      });
      return;
    } catch {
      // Continue to active recovery path.
    }

    if (isDevMode()) {
      try {
        await this.startDevForegroundDaemon();
      } catch (error) {
        const reason = error instanceof Error ? error.message : "daemon health check failed";
        throw new Error(`Daemon did not become healthy after start: ${reason}`);
      }
    } else {
      const startResult = await this.run(DAEMON_START_ARGS);
      if (startResult.error) {
        throw new Error(`Failed to start daemon: ${startResult.error}`);
      }

      if (startResult.exitCode !== 0) {
        throw new Error(formatCliFailure("start", startResult));
      }
      try {
        await this.waitForHealthy();
      } catch (error) {
        const reason = error instanceof Error ? error.message : "daemon health check failed";
        throw new Error(`Daemon did not become healthy after start: ${reason}`);
      }
    }
  }

  async stop(): Promise<void> {
    if (isDevMode()) {
      const stopped = await this.stopDevForegroundDaemon();
      if (stopped) {
        return;
      }
    }

    const stopResult = await this.run(DAEMON_STOP_ARGS);
    if (stopResult.error) {
      this.logger.warn(`Failed to stop daemon: ${stopResult.error}`);
      return;
    }

    if (stopResult.exitCode === 0) {
      return;
    }

    const details = [stopResult.stderr, stopResult.stdout].join("\n").trim();
    if (isDaemonNotRunning(details)) {
      return;
    }

    this.logger.warn(formatCliFailure("stop", stopResult));
  }

  async getInfo(): Promise<DaemonInfo> {
    const url = await resolveDaemonHealthUrl();
    const wsUrl = await resolveDaemonWebSocketUrl();
    const response = await this.fetchFn(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to load daemon health: HTTP ${response.status}`);
    }

    const body = (await response.json()) as { version?: unknown; daemonId?: unknown };
    const version = typeof body.version === "string" ? body.version.trim() : "";
    const daemonIdFromHealth = typeof body.daemonId === "string" ? body.daemonId.trim() : "";
    const daemonId = daemonIdFromHealth || (await readPersistedDaemonId());
    if (!version || !daemonId) {
      throw new Error("daemon health response is invalid");
    }

    return { version, daemonId, wsUrl };
  }
}
