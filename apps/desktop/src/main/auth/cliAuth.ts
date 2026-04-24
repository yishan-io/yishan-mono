import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { AuthLoginResult, AuthStatusResult, AuthTokensResult } from "../ipc";
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

type ParsedCredentialTokens = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
};

/** Resolves one desktop auth CLI executable path. */
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

/** Resolves active CLI profile name used for auth credential storage. */
function resolveCliProfileName(): string {
  if (isDevMode()) {
    return "dev";
  }

  return process.env.YISHAN_PROFILE?.trim() || "default";
}

/** Resolves CLI credential file path for the active profile. */
function resolveCredentialFilePath(): string {
  return resolve(homedir(), ".yishan", "profiles", resolveCliProfileName(), "credential.yaml");
}

/** Parses one YAML-like key-value credential file into auth token fields. */
function parseCredentialTokens(credentialText: string): ParsedCredentialTokens {
  const tokens: ParsedCredentialTokens = {};
  for (const rawLine of credentialText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['\"]|['\"]$/g, "");
    if (key === "api_token") {
      tokens.accessToken = value;
      continue;
    }
    if (key === "api_refresh_token") {
      tokens.refreshToken = value;
      continue;
    }
    if (key === "api_access_token_expires_at") {
      tokens.accessTokenExpiresAt = value;
      continue;
    }
    if (key === "api_refresh_token_expires_at") {
      tokens.refreshTokenExpiresAt = value;
    }
  }

  return tokens;
}

/** Reads auth tokens from CLI credential file for current profile. */
async function readAuthTokensFromCredentialFile(): Promise<ParsedCredentialTokens> {
  try {
    const credentialText = await readFile(resolveCredentialFilePath(), "utf8");
    return parseCredentialTokens(credentialText);
  } catch {
    return {};
  }
}

/** Executes one CLI command and captures exit status and output streams. */
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

/** Parses one whoami JSON payload into one normalized renderer-facing status result. */
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

/** Runs one status-first login flow by skipping CLI login when user is already authenticated. */
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

/** Returns one normalized auth status from CLI-backed auth commands. */
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

/** Returns auth tokens from CLI credential file after ensuring status/refresh is up to date. */
export async function getAuthTokens(options?: { run?: CliCommandRunner }): Promise<AuthTokensResult> {
  const status = await getAuthStatus(options);
  if (!status.authenticated) {
    return {
      authenticated: false,
      error: status.error,
    };
  }

  const tokens = await readAuthTokensFromCredentialFile();
  if (!tokens.accessToken || !tokens.refreshToken) {
    return {
      authenticated: false,
      error: "Auth tokens are missing from CLI credential file",
    };
  }

  return {
    authenticated: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
}
