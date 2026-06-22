import * as Linking from "expo-linking";
import { useCallback, useMemo, useState } from "react";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { StoredSession } from "@/lib/storage/session-storage";

import type { AuthFlow } from "../auth-context";
import { useGoogleOAuthCallbackFlow } from "./useGoogleOAuthCallbackFlow";
import { useGoogleOAuthStartCommand } from "./useGoogleOAuthStartCommand";

type UseAuthSignInFlowsOptions = {
  applyAuthenticatedSession: (session: StoredSession) => Promise<void>;
};

export function useAuthSignInFlows({ applyAuthenticatedSession }: UseAuthSignInFlowsOptions) {
  const incomingUrl = Linking.useURL();
  const { t } = useAppLanguage();
  const [authError, setAuthError] = useState<string | null>(null);
  const [authFlow, setAuthFlow] = useState<AuthFlow>("idle");

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const startGoogleOAuthSignIn = useGoogleOAuthStartCommand({
    setAuthError,
    setAuthFlow,
    unavailableMessage: t("auth.googleUnavailable"),
  });

  useGoogleOAuthCallbackFlow({
    applyAuthenticatedSession,
    callbackFailureMessage: t("auth.googleCompleteFailed"),
    expiredMessage: t("auth.googleRequestExpired"),
    incomingUrl,
    mismatchMessage: t("auth.googleRequestMismatch"),
    missingFieldsMessage: t("auth.googleCallbackMissingFields"),
    missingPendingRequestMessage: t("auth.googlePendingRequestMissing"),
    setAuthError,
    setAuthFlow,
  });

  return useMemo(
    () => ({
      authError,
      authFlow,
      clearAuthError,
      startGoogleOAuthSignIn,
    }),
    [authError, authFlow, clearAuthError, startGoogleOAuthSignIn],
  );
}
