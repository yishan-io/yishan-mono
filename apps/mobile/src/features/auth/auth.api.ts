import { apiRequest } from "@/lib/api/client";
import type { AuthTokenRecord, MobileOAuthExchangeInput } from "./auth.types";

// Owns auth transport wiring only; feature-side session normalization lives in auth-token-domain.ts.
export async function refreshSession(refreshToken: string): Promise<AuthTokenRecord> {
  return apiRequest<AuthTokenRecord>("/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    skipAuthRefresh: true,
  });
}

export async function revokeSession(refreshToken: string): Promise<void> {
  await apiRequest<{ ok: true }>("/auth/revoke", {
    method: "POST",
    body: { refreshToken },
    skipAuthRefresh: true,
  });
}

export async function exchangeMobileOAuthCode(input: MobileOAuthExchangeInput): Promise<AuthTokenRecord> {
  return apiRequest<AuthTokenRecord>("/auth/oauth/mobile/exchange", {
    method: "POST",
    body: input,
    skipAuthRefresh: true,
  });
}
