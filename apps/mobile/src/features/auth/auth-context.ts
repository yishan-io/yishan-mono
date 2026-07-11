import { createContext, useContext } from "react";

import type { StoredSession } from "@/lib/storage/session-storage";

export type AuthStatus = "loading" | "authenticated" | "signed-out";
export type AuthFlow = "idle" | "starting-google-oauth" | "completing-google-oauth";

export type AuthContextValue = {
  status: AuthStatus;
  session: StoredSession | null;
  authError: string | null;
  authFlow: AuthFlow;
  clearAuthError: () => void;
  startGoogleOAuthSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
