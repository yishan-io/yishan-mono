import { createSession, getSessionUser, invalidateSession } from "@/auth/session";
import { signAccessToken, verifyAccessToken } from "@/auth/security";
import { issueTokenPair, revokeRefreshToken, rotateRefreshToken } from "@/auth/tokens";
import type { AppDb } from "@/db/client";
import type { OAuthProfile, ServiceConfig } from "@/types";
import type { UserService } from "@/services/user-service";

export class AuthService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ServiceConfig,
    private readonly userService: UserService
  ) {}

  async resolveUserIdForOAuthProfile(profile: OAuthProfile): Promise<string> {
    return this.userService.resolveUserIdForOAuthProfile(profile);
  }

  async createWebSession(userId: string, sessionTtlDays: number) {
    return createSession(this.db, userId, sessionTtlDays);
  }

  async invalidateWebSession(sessionToken: string) {
    await invalidateSession(this.db, sessionToken);
  }

  async issueApiTokens(userId: string) {
    return issueTokenPair(this.db, userId, this.config);
  }

  async refreshApiTokens(refreshToken: string) {
    const rotated = await rotateRefreshToken(this.db, refreshToken, this.config);

    if (!rotated) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessExp = nowSeconds + this.config.jwtAccessTtlSeconds;
    const accessToken = await signAccessToken(
      {
        sub: rotated.userId,
        sid: rotated.refreshTokenId,
        scope: "api:read api:write",
        iss: this.config.jwtIssuer,
        aud: this.config.jwtAudience,
        iat: nowSeconds,
        exp: accessExp
      },
      this.config.jwtAccessSecret
    );

    return {
      accessToken,
      accessTokenExpiresIn: this.config.jwtAccessTtlSeconds,
      accessTokenExpiresAt: new Date(accessExp * 1000).toISOString(),
      refreshToken: rotated.refreshToken,
      refreshTokenExpiresAt: rotated.refreshTokenExpiresAt
    };
  }

  async revokeApiRefreshToken(refreshToken: string) {
    await revokeRefreshToken(this.db, refreshToken);
  }

  async getSessionUserByToken(sessionToken: string) {
    return getSessionUser(this.db, sessionToken);
  }

  async getUserFromAccessToken(accessToken: string) {
    const claims = await verifyAccessToken(
      accessToken,
      this.config.jwtAccessSecret,
      this.config.jwtIssuer,
      this.config.jwtAudience
    );

    if (!claims) {
      return null;
    }

    return this.userService.getById(claims.sub);
  }
}
