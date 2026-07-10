import type { MobileOAuthExchangeInput } from "@/features/auth/auth.types";
import type { OAuthCallbackParams } from "@/features/auth/oauth/auth-link";
import type { PendingGoogleOAuthSession } from "@/features/auth/oauth/oauth-storage";
import { getErrorMessage } from "@/helpers/errorHelpers";

const OAUTH_CALLBACK_MAX_AGE_MS = 10 * 60 * 1000;

export type ResolveGoogleOAuthCallbackInput = {
  callback: OAuthCallbackParams;
  messages: {
    expired: string;
    mismatch: string;
    missingFields: string;
    missingPendingRequest: string;
  };
  now: number;
  pendingSession: PendingGoogleOAuthSession | null;
};

export type ResolvedGoogleOAuthCallback =
  | { clearPendingSession: boolean; kind: "error"; message: string }
  | { clearPendingSession: boolean; input: MobileOAuthExchangeInput; kind: "exchange" };

export function getSignInErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? getErrorMessage(error) : fallbackMessage;
}

export function resolveGoogleOAuthCallback({
  callback,
  messages,
  now,
  pendingSession,
}: ResolveGoogleOAuthCallbackInput): ResolvedGoogleOAuthCallback {
  if (callback.error) {
    return {
      kind: "error",
      clearPendingSession: true,
      message: callback.errorDescription || callback.error,
    };
  }

  if (!callback.code || !callback.state) {
    return {
      kind: "error",
      clearPendingSession: true,
      message: messages.missingFields,
    };
  }

  if (!pendingSession) {
    return {
      kind: "error",
      clearPendingSession: false,
      message: messages.missingPendingRequest,
    };
  }

  if (now - pendingSession.createdAt > OAUTH_CALLBACK_MAX_AGE_MS) {
    return {
      kind: "error",
      clearPendingSession: true,
      message: messages.expired,
    };
  }

  if (pendingSession.state !== callback.state) {
    return {
      kind: "error",
      clearPendingSession: true,
      message: messages.mismatch,
    };
  }

  return {
    kind: "exchange",
    clearPendingSession: true,
    input: {
      provider: "google",
      code: callback.code,
      codeVerifier: pendingSession.codeVerifier,
      redirectUri: pendingSession.redirectUri,
      clientId: pendingSession.clientId,
    },
  };
}
