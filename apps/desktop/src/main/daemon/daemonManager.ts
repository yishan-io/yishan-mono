import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { resolveCliInvocation } from "../cli/cliInvocation";
import { isDevMode } from "../runtime/environment";
import {
  DAEMON_HEALTH_RETRY_COUNT,
  DAEMON_HEALTH_RETRY_DELAY_MS,
  DAEMON_PRECHECK_HEALTH_RETRY_COUNT,
  DAEMON_PRECHECK_HEALTH_RETRY_DELAY_MS,
  DEV_DAEMON_HEALTH_RETRY_COUNT,
  type DaemonInfo,
  fetchDaemonInfo,
  resolveCliProfileName,
  waitForDaemonHealthy,
} from "./daemonHealthCheck";

function buildDaemonStartArgs(): string[] {
  return ["daemon", "start", "--profile", resolveCliProfileName()];
}

function buildDaemonStopArgs(): string[] {
  return ["daemon", "stop", "--profile", resolveCliProfileName()];
}
const DAEMON_DEV_RELAY_URL = "http://127.0.0.1:8788";
const CLI_COMMAND_TIMEOUT_MS = 30_000;
const DEV_DAEMON_STOP_TIMEOUT_MS = 5_000;
const CLI_COMMAND_TERM_GRACE_MS = 1_000;
const CLI_COMMAND_FORCE_KILL_WAIT_MS = 1_000;

type CliCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

type CliCommandRunner = (args: string[]) => Promise<CliCommandResult>;

type DaemonLogger = Pick<Console, "warn" | "log">;

type DaemonManagerOptions = {
  run?: CliCommandRunner;
  logger?: DaemonLogger;
  fetch?: typeof fetch;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function terminateChildProcess(child: ChildProcess): Promise<void> {
  const waitForExit = new Promise<void>((resolvePromise) => {
    child.once("exit", () => {
      resolvePromise();
    });
  });

  const termSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGTERM";
  child.kill(termSignal);

  const exitedAfterTerminate = await Promise.race([
    waitForExit.then(() => true),
    delay(CLI_COMMAND_TERM_GRACE_MS).then(() => false),
  ]);

  if (!exitedAfterTerminate) {
    const killSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGKILL";
    child.kill(killSignal);
    await Promise.race([waitForExit, delay(CLI_COMMAND_FORCE_KILL_WAIT_MS)]);
  }
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
      void terminateChildProcess(child).finally(() => {
        resolveOnce({
          exitCode: null,
          stdout,
          stderr,
          error: `CLI command timed out after ${CLI_COMMAND_TIMEOUT_MS}ms`,
        });
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

function isDaemonNotRunning(result: CliCommandResult): boolean {
  return result.exitCode === 6;
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
  private readonly preferCliStartPath: boolean;
  private ensureStartedInFlight: Promise<void> | null = null;
  private devDaemonChild: ChildProcess | null = null;

  constructor(options?: DaemonManagerOptions) {
    this.run = options?.run ?? runCliCommand;
    this.logger = options?.logger ?? console;
    this.fetchFn = options?.fetch ?? fetch;
    this.preferCliStartPath = Boolean(options?.run);
  }

  private async waitForHealthy(options?: { retryCount?: number; retryDelayMs?: number }): Promise<void> {
    return waitForDaemonHealthy(this.fetchFn, delay, options);
  }

  private async startDevForegroundDaemon(): Promise<void> {
    if (this.devDaemonChild && !this.devDaemonChild.killed) {
      return;
    }

    const invocation = resolveCliInvocation();
    let output = "";
    const daemonRunArgs = ["daemon", "run", "--relay-url", DAEMON_DEV_RELAY_URL, "--profile", resolveCliProfileName()];
    const child = spawn(invocation.executablePath, [...invocation.prefixArgs, ...daemonRunArgs], {
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

    await Promise.race([this.waitForHealthy({ retryCount: DEV_DAEMON_HEALTH_RETRY_COUNT }), exitBeforeHealthy]);
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

    const termSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGTERM";
    child.kill(termSignal);
    const exitedAfterTerminate = await Promise.race([
      waitForExit.then(() => true),
      delay(DEV_DAEMON_STOP_TIMEOUT_MS).then(() => false),
    ]);

    if (!exitedAfterTerminate) {
      const killSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGKILL";
      child.kill(killSignal);
      await Promise.race([waitForExit, delay(CLI_COMMAND_FORCE_KILL_WAIT_MS)]);
    }

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

      // Daemon is already healthy — leave it running regardless of version.
      // If the daemon version is behind the app version, the renderer will
      // display an "outdated daemon" warning and the user can restart manually
      // from Settings when they are ready.
      return;
    } catch {
      // Daemon not healthy — continue to active recovery path.
    }

    if (isDevMode() && !this.preferCliStartPath) {
      try {
        await this.startDevForegroundDaemon();
      } catch (error) {
        const reason = error instanceof Error ? error.message : "daemon health check failed";
        throw new Error(`Daemon did not become healthy after start: ${reason}`);
      }
    } else {
      const startResult = await this.run(buildDaemonStartArgs());
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

    const stopResult = await this.run(buildDaemonStopArgs());
    if (stopResult.error) {
      this.logger.warn(`Failed to stop daemon: ${stopResult.error}`);
      return;
    }

    if (stopResult.exitCode === 0) {
      return;
    }

    if (isDaemonNotRunning(stopResult)) {
      return;
    }

    this.logger.warn(formatCliFailure("stop", stopResult));
  }

  async getInfo(): Promise<DaemonInfo> {
    return fetchDaemonInfo(this.fetchFn);
  }
}
