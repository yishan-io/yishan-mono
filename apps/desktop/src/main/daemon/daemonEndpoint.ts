import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { isDevMode } from "../runtime/environment";
const stateFileName = "daemon.state.json";
const idFileName = "daemon.id";
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
  return resolveDaemonProfilePath("logs", "daemon.log");
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
