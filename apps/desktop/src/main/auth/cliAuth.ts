import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AuthLoginResult, AuthStatusResult } from "../ipc";
import { isDevMode } from "../runtime/environment";

const CLI_WHOAMI_ARGS = ["whoami"];
const CLI_LOGIN_ARGS = ["login"];

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
    const devApiBaseUrl = process.env.VITE_API_BASE_URL?.trim() || "http://localhost:8787";

    return {
      executablePath: "go",
      prefixArgs: ["run", ".", "--profile", "dev", "--api-base-url", devApiBaseUrl],
      cwd: cliDir,
    };
  }

  const bundledCliName = process.platform === "win32" ? "yishan.exe" : "yishan";
  const bundledCliPath = resolve(process.resourcesPath, bundledCliName);
  if (!existsSync(bundledCliPath)) {
    const fallbackDevCliDir = process.env.YISHAN_CLI_DEV_DIR?.trim() || resolve(process.cwd(), "..", "cli");
    const cliDir = existsSync(fallbackDevCliDir) ? fallbackDevCliDir : undefined;

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

  return await new Promise<CliCommandResult>((resolve) => {
    let settled = false;
    const resolveOnce = (value: CliCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
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

function parseAuthStatusPayload(stdout: string): AuthStatusResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { authenticated: false, error: "CLI whoami returned an empty response" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return { authenticated: false, error: "CLI whoami response is not valid JSON" };
  }

  if (!payload || typeof payload !== "object") {
    return { authenticated: false, error: "CLI whoami response has an invalid shape" };
  }

  const candidate = payload as {
    authenticated?: unknown;
    isAuthenticated?: unknown;
    loggedIn?: unknown;
    expiresAt?: unknown;
    accessTokenExpiresAt?: unknown;
  };

  const authenticated =
    typeof candidate.authenticated === "boolean"
      ? candidate.authenticated
      : typeof candidate.isAuthenticated === "boolean"
        ? candidate.isAuthenticated
        : typeof candidate.loggedIn === "boolean"
          ? candidate.loggedIn
          : true;

  const expiresAtCandidate =
    typeof candidate.expiresAt === "string"
      ? candidate.expiresAt
      : typeof candidate.accessTokenExpiresAt === "string"
        ? candidate.accessTokenExpiresAt
        : undefined;

  return {
    authenticated,
    expiresAt: expiresAtCandidate,
  };
}

export async function login(options?: { run?: CliCommandRunner }): Promise<AuthLoginResult> {
  const run = options?.run ?? runCliCommand;
  const currentStatus = await getAuthStatus({ run });
  if (currentStatus.authenticated) {
    return { authenticated: true, skipped: true };
  }

  const loginResult = await run(CLI_LOGIN_ARGS);
  if (loginResult.error) {
    return { authenticated: false, skipped: false, error: loginResult.error };
  }

  if (loginResult.exitCode !== 0) {
    return {
      authenticated: false,
      skipped: false,
      error: loginResult.stderr.trim() || "CLI login command failed",
    };
  }

  const statusAfterLogin = await getAuthStatus({ run });
  if (!statusAfterLogin.authenticated) {
    return {
      authenticated: false,
      skipped: false,
      error: statusAfterLogin.error || "CLI login completed but auth status is still signed out",
    };
  }

  return { authenticated: true, skipped: false };
}

export async function getAuthStatus(options?: { run?: CliCommandRunner }): Promise<AuthStatusResult> {
  const run = options?.run ?? runCliCommand;
  const result = await run(CLI_WHOAMI_ARGS);

  if (result.error) {
    return { authenticated: false, error: result.error };
  }

  if (result.exitCode !== 0) {
    return { authenticated: false };
  }

  return parseAuthStatusPayload(result.stdout);
}
