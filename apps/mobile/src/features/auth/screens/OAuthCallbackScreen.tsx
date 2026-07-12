import { Redirect } from "expo-router";
import { useEffect, useState } from "react";

import { LoadingView } from "@/components/ui/LoadingView";
import { useAuth } from "@/features/auth/auth-context";
import { loadPendingGoogleOAuthSession } from "@/features/auth/oauth/oauth-storage";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

export default function OAuthCallbackScreen() {
  const { authError, authFlow, status } = useAuth();
  const { t } = useAppLanguage();
  const [hasCheckedPendingSession, setHasCheckedPendingSession] = useState(false);
  const [hasPendingSession, setHasPendingSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkPendingSession() {
      const pendingSession = await loadPendingGoogleOAuthSession();
      if (cancelled) {
        return;
      }

      setHasPendingSession(Boolean(pendingSession));
      setHasCheckedPendingSession(true);
    }

    void checkPendingSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "authenticated") {
    return <Redirect href="/(app)" />;
  }

  if (authFlow === "completing-google-oauth") {
    return <LoadingView label={t("auth.googleCompleteLoading")} />;
  }

  if (!hasCheckedPendingSession) {
    return <LoadingView label={t("auth.googleCompleteLoading")} />;
  }

  if (hasPendingSession && !authError) {
    return <LoadingView label={t("auth.googleCompleteLoading")} />;
  }

  return <Redirect href="/(public)" />;
}
