import { type PropsWithChildren, useMemo } from "react";

import { AuthContext, type AuthContextValue, useAuth } from "@/features/auth";
import { useAuthSessionRuntime } from "@/features/auth/hooks/useAuthSessionRuntime";
import { useAuthSignInFlows } from "@/features/auth/hooks/useAuthSignInFlows";

/** Owns auth runtime composition and exposes the feature-auth public context. */
export function AuthProvider({ children }: PropsWithChildren) {
  const { status, session, applyAuthenticatedSession, signOut } = useAuthSessionRuntime();
  const { authError, authFlow, clearAuthError, startGoogleOAuthSignIn } = useAuthSignInFlows({
    applyAuthenticatedSession,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      authError,
      authFlow,
      clearAuthError,
      startGoogleOAuthSignIn,
      signOut,
    }),
    [authError, authFlow, clearAuthError, session, signOut, startGoogleOAuthSignIn, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
