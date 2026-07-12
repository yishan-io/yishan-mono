import * as Linking from "expo-linking";
import { useCallback } from "react";

import {
  buildGoogleAuthorizationUrl,
  createCodeChallenge,
  createCodeVerifier,
  createOAuthState,
  getGoogleOAuthClientId,
  getGoogleOAuthRedirectUri,
  supportsGoogleOAuthBrowserFlow,
} from "@/features/auth/oauth/google-oauth";
import { clearPendingGoogleOAuthSession, savePendingGoogleOAuthSession } from "@/features/auth/oauth/oauth-storage";

import type { AuthFlow } from "../auth-context";
import { getSignInErrorMessage } from "./auth-sign-in-domain";

type UseGoogleOAuthStartCommandOptions = {
  setAuthError: (value: string | null) => void;
  setAuthFlow: (value: AuthFlow) => void;
  unavailableMessage: string;
};

export function useGoogleOAuthStartCommand({
  setAuthError,
  setAuthFlow,
  unavailableMessage,
}: UseGoogleOAuthStartCommandOptions) {
  return useCallback(async () => {
    setAuthFlow("starting-google-oauth");
    setAuthError(null);

    try {
      if (!supportsGoogleOAuthBrowserFlow()) {
        throw new Error(unavailableMessage);
      }

      const clientId = getGoogleOAuthClientId();
      const redirectUri = getGoogleOAuthRedirectUri();
      const state = createOAuthState();
      const codeVerifier = createCodeVerifier();
      const codeChallenge = await createCodeChallenge(codeVerifier);
      const authorizationUrl = buildGoogleAuthorizationUrl({
        clientId,
        codeChallenge,
        redirectUri,
        state,
      });

      await savePendingGoogleOAuthSession({
        clientId,
        codeVerifier,
        createdAt: Date.now(),
        provider: "google",
        redirectUri,
        state,
      });

      await Linking.openURL(authorizationUrl);
      setAuthFlow("idle");
    } catch (error) {
      await clearPendingGoogleOAuthSession();
      setAuthFlow("idle");
      setAuthError(getSignInErrorMessage(error, unavailableMessage));
      throw error;
    }
  }, [setAuthError, setAuthFlow, unavailableMessage]);
}
