import { subscribeDesktopRpcEvent as subscribeDesktopRpcEventFromTransport } from "@renderer/events/desktopRpcEventBus";
import { request, subscribeConnectionStatus as subscribeDaemonConnectionStatusFromTransport } from "@renderer/rpc";

/**
 * Session procedure adapters (desktop7 Phase 26). The session Domain owns
 * the daemon auth procedures (`app.*` namespace) over the root transport's
 * path-based invoke. These wrappers are the only session code that touches
 * transport; the wire DTOs live here (Domain Infrastructure).
 */

export type PersistAuthTokensInput = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
};

export type GetAccessTokenOutput = {
  accessToken: string;
  accessTokenExpiresAt?: string;
};

export type CheckAuthStatusOutput = {
  authenticated: boolean;
  accessTokenExpiresAt?: string;
};

export type LogoutOutput = {
  ok: boolean;
};

export type ReloadAuthConfigOutput = {
  ok: boolean;
};

export function subscribeDaemonConnectionStatus(
  listener: (status: "connected" | "connecting" | "disconnected") => void,
): () => void {
  return subscribeDaemonConnectionStatusFromTransport(listener);
}

export function subscribeDesktopRpcEvent(listener: (event: { method: string; payload?: unknown }) => void): () => void {
  return subscribeDesktopRpcEventFromTransport(listener);
}

export async function persistAuthTokens(input: PersistAuthTokensInput): Promise<{ ok: boolean }> {
  return (await request("app.persistAuthTokens", input)) as { ok: boolean };
}

export async function getAccessToken(): Promise<GetAccessTokenOutput> {
  return (await request("app.getAccessToken", {})) as GetAccessTokenOutput;
}

export async function checkAuthStatus(): Promise<CheckAuthStatusOutput> {
  return (await request("app.checkAuthStatus", {})) as CheckAuthStatusOutput;
}

export async function logoutFromDaemon(): Promise<LogoutOutput> {
  return (await request("app.logout", {})) as LogoutOutput;
}

export async function reloadAuthConfig(): Promise<ReloadAuthConfigOutput> {
  return (await request("app.reloadAuthConfig", {})) as ReloadAuthConfigOutput;
}
