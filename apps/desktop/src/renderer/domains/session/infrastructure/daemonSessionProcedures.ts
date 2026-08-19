import {
  invokeDaemonProcedure,
  subscribeDaemonConnectionStatus as subscribeDaemonConnectionStatusFromTransport,
  subscribeDesktopRpcEvent as subscribeDesktopRpcEventFromTransport,
} from "../../../rpc/rpcTransport";

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
  return (await invokeDaemonProcedure("app.persistAuthTokens", input)) as { ok: boolean };
}

export async function getAccessToken(): Promise<GetAccessTokenOutput> {
  return (await invokeDaemonProcedure("app.getAccessToken", {})) as GetAccessTokenOutput;
}

export async function checkAuthStatus(): Promise<CheckAuthStatusOutput> {
  return (await invokeDaemonProcedure("app.checkAuthStatus", {})) as CheckAuthStatusOutput;
}

export async function logoutFromDaemon(): Promise<LogoutOutput> {
  return (await invokeDaemonProcedure("app.logout", {})) as LogoutOutput;
}

export async function reloadAuthConfig(): Promise<ReloadAuthConfigOutput> {
  return (await invokeDaemonProcedure("app.reloadAuthConfig", {})) as ReloadAuthConfigOutput;
}
