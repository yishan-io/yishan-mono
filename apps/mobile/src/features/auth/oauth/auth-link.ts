import * as Linking from "expo-linking";

import { isGoogleOAuthCallbackPath, isGoogleOAuthRedirectUrl } from "@/features/auth/oauth/google-oauth";

function readQueryParam(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.find((item) => item.trim().length > 0)?.trim() ?? "";
  }

  return "";
}

export type OAuthCallbackParams = {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
};

export function extractOAuthCallbackParams(value: string): OAuthCallbackParams | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.includes("://") && !trimmed.startsWith("http://") && !trimmed.startsWith("https://"))) {
    return null;
  }

  const parsed = Linking.parse(trimmed);
  const path = parsed.path?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  const hostname = parsed.hostname?.trim() ?? "";
  const matchesCallbackPath = isGoogleOAuthCallbackPath(path, hostname);

  let matchesRedirectUrl = false;
  try {
    matchesRedirectUrl = isGoogleOAuthRedirectUrl(trimmed);
  } catch {
    matchesRedirectUrl = false;
  }

  if (!matchesRedirectUrl && !matchesCallbackPath) {
    return null;
  }

  return {
    code: readQueryParam(parsed.queryParams?.code) || undefined,
    state: readQueryParam(parsed.queryParams?.state) || undefined,
    error: readQueryParam(parsed.queryParams?.error) || undefined,
    errorDescription: readQueryParam(parsed.queryParams?.error_description) || undefined,
  };
}
