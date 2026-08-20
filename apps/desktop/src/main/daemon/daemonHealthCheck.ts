import { readPersistedDaemonId, resolveDaemonHealthUrl, resolveDaemonWebSocketUrl } from "./daemonEndpoint";
export { readPersistedDaemonId, resolveDaemonHealthUrl, resolveDaemonWebSocketUrl } from "./daemonEndpoint";
export const DAEMON_HEALTH_RETRY_COUNT = 24;
export const DAEMON_HEALTH_RETRY_DELAY_MS = 50;
export const DAEMON_PRECHECK_HEALTH_RETRY_COUNT = 1;
export const DAEMON_PRECHECK_HEALTH_RETRY_DELAY_MS = 20;
export const DEV_DAEMON_HEALTH_RETRY_COUNT = 200;
export type DaemonRelayInfo = {
  enabled: boolean;
  url: string;
  connected: boolean;
  connectedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
};
export type DaemonInfo = { version: string; daemonId: string; wsUrl: string; relay?: DaemonRelayInfo };
/** Polls daemon health until it responds successfully. */
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
      const response = await fetchFn(await resolveDaemonHealthUrl(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (response.ok) return;
      lastError = new Error(`daemon health check failed: HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("daemon health check failed");
    }
    if (attempt < retryCount) await delay(retryDelayMs);
  }
  throw lastError ?? new Error("daemon failed health checks after start");
}
/** Fetches and validates daemon information from health. */
export async function fetchDaemonInfo(fetchFn: typeof fetch): Promise<DaemonInfo> {
  const response = await fetchFn(await resolveDaemonHealthUrl(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Failed to load daemon health: HTTP ${response.status}`);
  const body = (await response.json()) as { version?: unknown; daemonId?: unknown; relay?: unknown };
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const daemonId = (typeof body.daemonId === "string" ? body.daemonId.trim() : "") || (await readPersistedDaemonId());
  if (!version || !daemonId) throw new Error("daemon health response is invalid");
  const result: DaemonInfo = { version, daemonId, wsUrl: await resolveDaemonWebSocketUrl() };
  if (body.relay && typeof body.relay === "object") {
    const relay = body.relay as Record<string, unknown>;
    result.relay = {
      enabled: relay.enabled === true,
      url: typeof relay.url === "string" ? relay.url : "",
      connected: relay.connected === true,
      connectedAt: typeof relay.connectedAt === "string" ? relay.connectedAt : undefined,
      lastError: typeof relay.lastError === "string" ? relay.lastError : undefined,
      lastErrorAt: typeof relay.lastErrorAt === "string" ? relay.lastErrorAt : undefined,
    };
  }
  return result;
}
