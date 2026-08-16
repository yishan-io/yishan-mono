/**
 * SessionCommands — the public command surface for the Session feature.
 *
 * Owns session bootstrap reads, auth-expiry signaling, and the daemon-info
 * refresh subscription. UI and hooks call these instead of opening transport
 * (api/restClient, api/sessionApi, api/systemApi, rpc) directly.
 */
import type { DaemonInfoResult } from "../../../../main/ipc";
import { getRemoteHealthStatus as getRemoteHealthStatusFromApi } from "../../../api/systemApi";
import { onAuthExpired, resetAuthExpiredState as resetAuthExpiredStateFromApi, RestApiError } from "../../../api/restClient";
import { getSessionBootstrapData as getSessionBootstrapDataFromApi } from "../../../api/sessionApi";
import { subscribeDaemonConnectionStatus as subscribeDaemonConnectionStatusFromRpc, subscribeDesktopRpcEvent } from "../../../rpc/rpcTransport";
import { sessionStore } from "../../../features/session/model/sessionStore";

/** Loads the session bootstrap payload (user, orgs, preferences). */
export function getSessionBootstrapData() {
  return getSessionBootstrapDataFromApi();
}

/** Tracks remote api-service reachability for login-screen diagnostics. */
export function getRemoteHealthStatus() {
  return getRemoteHealthStatusFromApi();
}

/** Clears the expired-auth flag after a successful re-login. */
export function resetAuthExpiredState(): void {
  resetAuthExpiredStateFromApi();
}

/**
 * Subscribes one listener to auth-expired signals from the REST layer.
 * Returns a teardown.
 */
export function subscribeAuthExpired(listener: () => void): () => void {
  return onAuthExpired(listener);
}

/** Returns true when the error is a 401 auth-expired REST error. */
export function isAuthExpiredError(error: unknown): boolean {
  return error instanceof RestApiError && error.status === 401;
}

function isDaemonInfo(value: unknown): value is DaemonInfoResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.daemonId === "string" && typeof record.version === "string" && typeof record.wsUrl === "string";
}

/**
 * Subscribes to daemon.info.refreshed desktop events and mirrors the daemon
 * identity into sessionStore. Returns a teardown. Owned by the Session feature
 * so hooks never subscribe to transport directly for daemon identity.
 */
export function subscribeDaemonInfoRefresh(): () => void {
  return subscribeDesktopRpcEvent((event) => {
    if (event.method !== "daemon.info.refreshed" || !isDaemonInfo(event.payload)) {
      return;
    }
    sessionStore.getState().setDaemonInfo({
      daemonId: event.payload.daemonId,
      daemonVersion: event.payload.version,
    });
  });
}

/**
 * Subscribes one listener to daemon.info.refreshed desktop events with the full
 * DaemonInfoResult payload. Returns a teardown. Used by daemon settings views
 * that need wsUrl/relay, unlike `subscribeDaemonInfoRefresh` which only mirrors
 * daemonId/version into sessionStore.
 */
export function subscribeDaemonInfoRefreshed(listener: (info: DaemonInfoResult) => void): () => void {
  return subscribeDesktopRpcEvent((event) => {
    if (event.method !== "daemon.info.refreshed" || !isDaemonInfo(event.payload)) {
      return;
    }
    listener(event.payload);
  });
}

/**
 * Subscribes one listener to daemon connection status changes. Returns a
 * teardown. Session owns the transport binding; hooks reflect the state.
 */
export function subscribeDaemonConnectionStatus(
  listener: (status: "connected" | "connecting" | "disconnected") => void,
): () => void {
  return subscribeDaemonConnectionStatusFromRpc(listener);
}
