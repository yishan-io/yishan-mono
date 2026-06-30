import { useEffect, useRef } from "react";

import { exchangeMobileOAuthCode } from "@/features/auth/auth.api";
import { extractOAuthCallbackParams } from "@/features/auth/oauth/auth-link";
import { clearPendingGoogleOAuthSession, loadPendingGoogleOAuthSession } from "@/features/auth/oauth/oauth-storage";
import { isApiError } from "@/lib/api/errors";
import type { StoredSession } from "@/lib/storage/session-storage";

import type { AuthFlow } from "../auth-context";
import { toStoredSession } from "../auth-token-domain";
import { resolveGoogleOAuthCallback } from "./auth-sign-in-domain";

type UseGoogleOAuthCallbackFlowOptions = {
  applyAuthenticatedSession: (session: StoredSession) => Promise<void>;
  callbackFailureMessage: string;
  expiredMessage: string;
  incomingUrl: string | null;
  mismatchMessage: string;
  missingFieldsMessage: string;
  missingPendingRequestMessage: string;
  setAuthError: (value: string | null) => void;
  setAuthFlow: (value: AuthFlow) => void;
};

export function useGoogleOAuthCallbackFlow({
  applyAuthenticatedSession,
  callbackFailureMessage,
  expiredMessage,
  incomingUrl,
  mismatchMessage,
  missingFieldsMessage,
  missingPendingRequestMessage,
  setAuthError,
  setAuthFlow,
}: UseGoogleOAuthCallbackFlowOptions) {
  const lastHandledOAuthUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!incomingUrl || incomingUrl === lastHandledOAuthUrlRef.current) {
      return;
    }

    const resolvedCallback = extractOAuthCallbackParams(incomingUrl);
    if (!resolvedCallback) {
      return;
    }

    const callback = resolvedCallback;
    lastHandledOAuthUrlRef.current = incomingUrl;
    let cancelled = false;

    async function handleCallback() {
      const pendingSession = await loadPendingGoogleOAuthSession();
      if (cancelled) {
        return;
      }

      const resolved = resolveGoogleOAuthCallback({
        callback,
        pendingSession,
        now: Date.now(),
        messages: {
          expired: expiredMessage,
          mismatch: mismatchMessage,
          missingFields: missingFieldsMessage,
          missingPendingRequest: missingPendingRequestMessage,
        },
      });

      if (resolved.clearPendingSession) {
        await clearPendingGoogleOAuthSession();
      }

      if (cancelled) {
        return;
      }

      if (resolved.kind === "error") {
        setAuthFlow("idle");
        setAuthError(resolved.message);
        return;
      }

      try {
        setAuthFlow("completing-google-oauth");
        setAuthError(null);
        const nextSession = await exchangeMobileOAuthCode(resolved.input);
        if (cancelled) {
          return;
        }

        await applyAuthenticatedSession(toStoredSession(nextSession));
        if (cancelled) {
          return;
        }

        setAuthError(null);
        setAuthFlow("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAuthFlow("idle");
        setAuthError(isApiError(error) ? error.message : callbackFailureMessage);
      }
    }

    void handleCallback();

    return () => {
      cancelled = true;
    };
  }, [
    applyAuthenticatedSession,
    callbackFailureMessage,
    expiredMessage,
    incomingUrl,
    mismatchMessage,
    missingFieldsMessage,
    missingPendingRequestMessage,
    setAuthError,
    setAuthFlow,
  ]);
}
