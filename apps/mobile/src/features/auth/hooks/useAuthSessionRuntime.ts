import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toStoredSession } from "@/features/auth/auth-token-domain";
import { refreshSession as requestSessionRefresh, revokeSession } from "@/features/auth/auth.api";
import { configureApiAuthHandlers } from "@/lib/api/client";
import { queryClient } from "@/lib/query/query-client";
import {
  type StoredSession,
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from "@/lib/storage/session-storage";

import type { AuthStatus } from "../auth-context";
import { bootstrapAuthSessionRuntime } from "./auth-session-bootstrap";
import { normalizeStoredSession } from "./auth-session-runtime-domain";

export function useAuthSessionRuntime() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const commitAuthenticatedSessionState = useCallback((nextSession: StoredSession) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setStatus("authenticated");
  }, []);

  const applyAuthenticatedSession = useCallback(
    async (nextSession: StoredSession) => {
      const normalized = normalizeStoredSession(nextSession);
      await saveStoredSession(normalized);
      commitAuthenticatedSessionState(normalized);
    },
    [commitAuthenticatedSessionState],
  );

  const clearSessionState = useCallback(async () => {
    sessionRef.current = null;
    setSession(null);
    setStatus("signed-out");
    queryClient.clear();
    await clearStoredSession();
  }, []);

  const bootstrap = useCallback(async () => {
    await bootstrapAuthSessionRuntime({
      applyAuthenticatedSession,
      clearSessionState,
      commitAuthenticatedSessionState,
      loadStoredSession,
      refreshSession: async (refreshToken) =>
        normalizeStoredSession(toStoredSession(await requestSessionRefresh(refreshToken))),
    });
  }, [applyAuthenticatedSession, clearSessionState, commitAuthenticatedSessionState]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    configureApiAuthHandlers({
      getSession: () => sessionRef.current,
      refreshSession: async (refreshToken) =>
        normalizeStoredSession(toStoredSession(await requestSessionRefresh(refreshToken))),
      commitSession: async (nextSession) => {
        if (!nextSession) {
          await clearSessionState();
          return;
        }

        await applyAuthenticatedSession(nextSession);
      },
    });

    return () => {
      configureApiAuthHandlers(null);
    };
  }, [applyAuthenticatedSession, clearSessionState]);

  const signOut = useCallback(async () => {
    const current = sessionRef.current;

    await clearSessionState();

    if (current?.refreshToken) {
      try {
        await revokeSession(current.refreshToken);
      } catch {
        // Ignore revoke failures during sign-out; local sign-out should still succeed.
      }
    }
  }, [clearSessionState]);

  return useMemo(
    () => ({
      status,
      session,
      applyAuthenticatedSession,
      clearSessionState,
      signOut,
    }),
    [applyAuthenticatedSession, clearSessionState, session, signOut, status],
  );
}
