import { StatusCodes } from "http-status-codes";

import { exchangeCodeForProfileWithRedirectUri } from "@/auth/oauth";
import type { AppContext } from "@/hono";
import type { MobileOAuthExchangeBodyInput } from "@/validation/auth";

export async function exchangeMobileOAuthHandler(c: AppContext, body: MobileOAuthExchangeBodyInput) {
  const config = c.get("config");
  const authService = c.get("services").auth;

  if (!config.googleMobileClientIds.includes(body.clientId)) {
    return c.json({ error: "Unsupported mobile Google client" }, StatusCodes.BAD_REQUEST);
  }

  const profile = await exchangeCodeForProfileWithRedirectUri(
    body.provider,
    body.code,
    body.codeVerifier,
    config,
    body.redirectUri,
    {
      clientId: body.clientId,
      clientSecret: undefined,
    },
  );

  if (!profile.emailVerified) {
    return c.json({ error: "Provider email must be verified" }, StatusCodes.BAD_REQUEST);
  }

  const userId = await authService.resolveUserIdForOAuthProfile(profile);
  const tokens = await authService.issueApiTokens(userId);

  return c.json({
    tokenType: "Bearer",
    ...tokens,
  });
}
