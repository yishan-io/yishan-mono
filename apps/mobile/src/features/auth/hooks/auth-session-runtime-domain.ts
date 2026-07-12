import { isApiError } from "@/lib/api/errors";
import type { StoredSession } from "@/lib/storage/session-storage";

export function normalizeStoredSession(session: StoredSession): StoredSession {
  return {
    ...session,
    tokenType: "Bearer",
  };
}

export function shouldRefreshStoredSession(expiresAtIso: string, thresholdMs = 60_000): boolean {
  const expiresAt = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return expiresAt - Date.now() <= thresholdMs;
}

export function shouldClearStoredSessionAfterRefreshFailure(error: unknown): boolean {
  return isApiError(error) && [400, 401, 403].includes(error.status);
}
