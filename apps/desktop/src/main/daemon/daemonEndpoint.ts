import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { isDevMode } from "../runtime/environment";
const stateFileName = "daemon.state.json";
const idFileName = "daemon.id";
const systemLogFileName = "system.log";
const runtimeLogFileName = "runtime.log";
const legacyDaemonLogFileName = "daemon.log";
type DaemonState = { host: string; port: number };
/** Resolves the CLI profile with development mode taking precedence over YISHAN_PROFILE. */
export function resolveCliProfileName(): string {
  return isDevMode() ? "dev" : process.env.YISHAN_PROFILE?.trim() || "default";
}
/** Resolves a file in the current CLI profile. */
export function resolveDaemonProfilePath(...segments: string[]): string {
  return resolve(homedir(), ".yishan", "profiles", resolveCliProfileName(), ...segments);
}
export function resolveDaemonStateFilePath(): string {
  return resolveDaemonProfilePath(stateFileName);
}
export function resolveDaemonIdFilePath(): string {
  return resolveDaemonProfilePath(idFileName);
}
export function resolveDaemonLogFilePath(): string {
  return resolveDaemonProfilePath("logs", systemLogFileName);
}

/** Resolves the legacy profile log path for read-only fallback support. */
export function resolveLegacyDaemonLogFilePath(): string {
  return resolveDaemonProfilePath("logs", legacyDaemonLogFileName);
}

/** Resolves an account-scoped daemon log path when the user id is a safe path segment. */
export function resolveAccountDaemonLogFilePath(userId: string): string | null {
  if (!isSafeAccountUserId(userId)) return null;
  return resolveDaemonProfilePath("accounts", userId, "logs", runtimeLogFileName);
}

/** Reads the active account id from the profile credential file without exposing credential contents. */
export async function readActiveAccountUserId(): Promise<string | null> {
  try {
    return parseCredentialUserId(await readFile(resolveDaemonProfilePath("credential.yaml"), "utf8"));
  } catch {
    return null;
  }
}

function parseCredentialUserId(credential: string): string | null {
  for (const credentialLine of credential.split(/\r?\n/)) {
    const match = credentialLine.match(/^\s*user_id\s*:\s*(.*?)\s*(?:#.*)?$/);
    if (!match) continue;
    const rawUserId = match[1];
    if (rawUserId === undefined) return null;
    const value = rawUserId.trim();
    const userId =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1).trim()
        : value;
    return isSafeAccountUserId(userId) ? userId : null;
  }
  return null;
}

function isSafeAccountUserId(userId: string): boolean {
  return (
    Boolean(userId) &&
    userId !== "." &&
    userId !== ".." &&
    !userId.includes("/") &&
    !userId.includes("\\") &&
    !userId.includes("\0") &&
    !userId.includes("\r") &&
    !userId.includes("\n")
  );
}
/** Reads the persisted daemon id, returning an empty value if unavailable. */
export async function readPersistedDaemonId(): Promise<string> {
  try {
    return (await readFile(resolveDaemonIdFilePath(), "utf8")).trim();
  } catch {
    return "";
  }
}
async function readState(): Promise<DaemonState> {
  const path = resolveDaemonStateFilePath();
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as { host?: unknown; port?: unknown };
  const host = typeof parsed.host === "string" ? parsed.host.trim() : "";
  const port = typeof parsed.port === "number" ? parsed.port : 0;
  if (!host || port <= 0) throw new Error("daemon state is invalid");
  return { host, port };
}
/** Derives the WebSocket URL from a health URL, or returns empty for malformed input. */
export function resolveDaemonWsUrlFromHealthUrl(healthUrl: string): string {
  try {
    const url = new URL(healthUrl);
    return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/ws`;
  } catch {
    return "";
  }
}
/** Resolves health URL from persisted state in development, otherwise explicit overrides then persisted state. */
export async function resolveDaemonHealthUrl(): Promise<string> {
  if (!isDevMode()) {
    const health = process.env.YISHAN_DAEMON_HEALTH_URL?.trim();
    if (health) return health;
    const ws = process.env.YISHAN_DAEMON_WS_URL?.trim();
    if (ws)
      try {
        const url = new URL(ws);
        return `${url.protocol === "wss:" ? "https:" : "http:"}//${url.host}/healthz`;
      } catch {}
  }
  const state = await readState();
  return `http://${state.host}:${state.port}/healthz`;
}
/** Resolves WebSocket URL from persisted state in development, otherwise explicit overrides then persisted state. */
export async function resolveDaemonWebSocketUrl(): Promise<string> {
  if (!isDevMode()) {
    const ws = process.env.YISHAN_DAEMON_WS_URL?.trim();
    if (ws) return ws;
    const health = process.env.YISHAN_DAEMON_HEALTH_URL?.trim();
    if (health) {
      const inferred = resolveDaemonWsUrlFromHealthUrl(health);
      if (inferred) return inferred;
    }
  }
  const state = await readState();
  return `ws://${state.host}:${state.port}/ws`;
}
