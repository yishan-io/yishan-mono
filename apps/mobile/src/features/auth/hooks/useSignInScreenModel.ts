import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";

import { useAuth } from "@/features/auth/auth-context";
import { useAppTheme } from "@/features/theme/AppThemeProvider";
import { APP_VERSION } from "@/lib/config/app";
import { getThemeBackgroundAppColor } from "@/lib/theme/tamaguiThemes";

export function useSignInScreenModel() {
  const router = useRouter();
  const { resolvedTheme } = useAppTheme();
  const { authError, authFlow, clearAuthError, startGoogleOAuthSignIn, status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [router, status]);

  const startGoogle = useCallback(() => {
    clearAuthError();
    void startGoogleOAuthSignIn().catch(() => {
      // AuthProvider already commits the visible error state.
    });
  }, [clearAuthError, startGoogleOAuthSignIn]);

  return {
    authError,
    backgroundColor: getThemeBackgroundAppColor(resolvedTheme),
    googleAvailable: true,
    googleLoading: authFlow === "starting-google-oauth" || authFlow === "completing-google-oauth",
    startGoogle,
    version: APP_VERSION,
  };
}
