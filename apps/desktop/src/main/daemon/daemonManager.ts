import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isDevMode } from "../runtime/environment";

const DAEMON_START_ARGS = ["daemon", "start", "--jwt-required=false"];
const DAEMON_STOP_ARGS = ["daemon", "stop"];

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
};

function resolveCliInvocation(): CliInvocation {
  const explicitCliPath = process.env.YISHAN_CLI_PATH?.trim();
  if (explicitCliPath) {
    return {
      executablePath: explicitCliPath,
      prefixArgs: [],
    };
  }

  if (isDevMode()) {
    const configuredDevCliDir = process.env.YISHAN_CLI_DEV_DIR?.trim();
    const candidateDir = configuredDevCliDir || resolve(process.cwd(), "..", "cli");
    const cliDir = existsSync(candidateDir) ? candidateDir : undefined;

    return {
      executablePath: "go",
      prefixArgs: ["run", ".", "--profile", "dev"],
      cwd: cliDir,
    };
  }

  const bundledCliName = process.platform === "win32" ? "yishan.exe" : "yishan";

  return {
    executablePath: resolve(process.resourcesPath, bundledCliName),
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

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolveOnce({
        exitCode: null,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : "Failed to run CLI command",
      });
    });

    child.on("close", (exitCode) => {
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

export class DaemonManager {
  private readonly run: CliCommandRunner;
  private readonly logger: DaemonLogger;

  constructor(options?: DaemonManagerOptions) {
    this.run = options?.run ?? runCliCommand;
    this.logger = options?.logger ?? console;
  }

  async ensureStarted(): Promise<void> {
    const startResult = await this.run(DAEMON_START_ARGS);
    if (startResult.error) {
      throw new Error(`Failed to start daemon: ${startResult.error}`);
    }

    if (startResult.exitCode !== 0) {
      throw new Error(formatCliFailure("start", startResult));
    }
  }

  async stop(): Promise<void> {
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
}
