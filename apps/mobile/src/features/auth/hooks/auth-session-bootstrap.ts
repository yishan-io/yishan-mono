import type { StoredSession } from "@/lib/storage/session-storage";

import {
  normalizeStoredSession,
  shouldClearStoredSessionAfterRefreshFailure,
  shouldRefreshStoredSession,
} from "./auth-session-runtime-domain";

type BootstrapAuthSessionRuntimeOptions = {
  applyAuthenticatedSession: (session: StoredSession) => Promise<void>;
  clearSessionState: () => Promise<void>;
  commitAuthenticatedSessionState: (session: StoredSession) => void;
  loadStoredSession: () => Promise<StoredSession | null>;
  refreshSession: (refreshToken: string) => Promise<StoredSession>;
};

export async function bootstrapAuthSessionRuntime({
  applyAuthenticatedSession,
  clearSessionState,
  commitAuthenticatedSessionState,
  loadStoredSession,
  refreshSession,
}: BootstrapAuthSessionRuntimeOptions): Promise<void> {
  const storedSession = await loadStoredSession();
  if (!storedSession) {
    await clearSessionState();
    return;
  }

  const normalizedSession = normalizeStoredSession(storedSession);
  commitAuthenticatedSessionState(normalizedSession);

  if (!shouldRefreshStoredSession(normalizedSession.accessTokenExpiresAt)) {
    return;
  }

  try {
    const refreshedSession = await refreshSession(normalizedSession.refreshToken);
    await applyAuthenticatedSession(normalizeStoredSession(refreshedSession));
  } catch (error) {
    if (shouldClearStoredSessionAfterRefreshFailure(error)) {
      await clearSessionState();
    }
  }
}
