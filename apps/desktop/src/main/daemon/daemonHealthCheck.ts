import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { isDevMode } from "../runtime/environment";

const DAEMON_STATE_FILE_NAME = "daemon.state.json";
const DAEMON_ID_FILE_NAME = "daemon.id";
export const DAEMON_HEALTH_RETRY_COUNT = 24;
export const DAEMON_HEALTH_RETRY_DELAY_MS = 50;
export const DAEMON_PRECHECK_HEALTH_RETRY_COUNT = 1;
export const DAEMON_PRECHECK_HEALTH_RETRY_DELAY_MS = 20;
/** Dev mode uses go run . which compiles from source — need longer timeout for cold build cache. */
export const DEV_DAEMON_HEALTH_RETRY_COUNT = 200;

type DaemonState = {
  host: string;
  port: number;
};

export type DaemonRelayInfo = {
  enabled: boolean;
  url: string;
  connected: boolean;
  connectedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
};

export type DaemonInfo = {
  version: string;
  daemonId: string;
  wsUrl: string;
  relay?: DaemonRelayInfo;
};

export function resolveCliProfileName(): string {
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

export async function readPersistedDaemonId(): Promise<string> {
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

export function resolveDaemonWsUrlFromHealthUrl(healthUrl: string): string {
  try {
    const parsed = new URL(healthUrl);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}/ws`;
  } catch {
    return "";
  }
}

export async function resolveDaemonHealthUrl(): Promise<string> {
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

export async function resolveDaemonWebSocketUrl(): Promise<string> {
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

/**
 * Polls the daemon health endpoint until it responds with a 200, retrying up
 * to `retryCount` times with `retryDelayMs` between each attempt.
 */
export async function waitForDaemonHealthy(
  fetchFn: typeof fetch,
  delay: (ms: number) => Promise<void>,
  options?: { retryCount?: number; retryDelayMs?: number },
): Promise<void> {
  const retryCount = Math.max(0, Math.floor(options?.retryCount ?? DAEMON_HEALTH_RETRY_COUNT));
  const retryDelayMs = Math.max(0, Math.floor(options?.retryDelayMs ?? DAEMON_HEALTH_RETRY_DELAY_MS));
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const url = await resolveDaemonHealthUrl();
      const response = await fetchFn(url, {
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

/** Fetches daemon info from the health endpoint and the persisted ID file. */
export async function fetchDaemonInfo(fetchFn: typeof fetch): Promise<DaemonInfo> {
  const url = await resolveDaemonHealthUrl();
  const wsUrl = await resolveDaemonWebSocketUrl();
  const response = await fetchFn(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load daemon health: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { version?: unknown; daemonId?: unknown; relay?: unknown };
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const daemonIdFromHealth = typeof body.daemonId === "string" ? body.daemonId.trim() : "";
  const daemonId = daemonIdFromHealth || (await readPersistedDaemonId());
  if (!version || !daemonId) {
    throw new Error("daemon health response is invalid");
  }

  const result: DaemonInfo = { version, daemonId, wsUrl };

  if (body.relay != null && typeof body.relay === "object") {
    const r = body.relay as Record<string, unknown>;
    result.relay = {
      enabled: r.enabled === true,
      url: typeof r.url === "string" ? r.url : "",
      connected: r.connected === true,
      connectedAt: typeof r.connectedAt === "string" ? r.connectedAt : undefined,
      lastError: typeof r.lastError === "string" ? r.lastError : undefined,
      lastErrorAt: typeof r.lastErrorAt === "string" ? r.lastErrorAt : undefined,
    };
  }

  return result;
}

export function resolveDaemonLogFilePath(): string {
  return resolve(homedir(), ".yishan", "profiles", resolveCliProfileName(), "logs", "daemon.log");
}

/** Checks if a path exists on disk. */
export function firstExistingPath(candidates: Array<string | undefined>): string | undefined {
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
