import { and, eq, gt, isNull } from "drizzle-orm";

import { type OAuthStart, buildAuthorizationUrl, exchangeCodeForProfile } from "@/auth/oauth";
import { randomToken, sha256Hex, signAccessToken, verifyAccessToken } from "@/auth/security";
import type { AppDb } from "@/db/client";
import { refreshTokens, sessions, users } from "@/db/schema";
import { newId } from "@/lib/id";
import type { UserService } from "@/services/user-service";
import type { OAuthProfile, OAuthProvider, ServiceConfig } from "@/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TOKEN_SCOPE = "api:read api:write";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  userPreferences?: unknown;
};

export class AuthService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ServiceConfig,
    private readonly userService: UserService,
  ) {}

  // ── OAuth ─────────────────────────────────────────────────────────────────

  /** Builds the authorization URL and PKCE state for an OAuth provider redirect. */
  async buildOAuthAuthorizationUrl(provider: OAuthProvider, callbackBaseUrl: string): Promise<OAuthStart> {
    return buildAuthorizationUrl(provider, this.config, callbackBaseUrl);
  }

  /** Exchanges an OAuth authorization code for a user profile. */
  async exchangeOAuthCodeForProfile(
    provider: OAuthProvider,
    code: string,
    codeVerifier: string,
    callbackBaseUrl: string,
  ): Promise<OAuthProfile> {
    return exchangeCodeForProfile(provider, code, codeVerifier, this.config, callbackBaseUrl);
  }

  async resolveUserIdForOAuthProfile(profile: OAuthProfile): Promise<string> {
    return this.userService.resolveUserIdForOAuthProfile(profile);
  }

  // ── Web session ───────────────────────────────────────────────────────────

  async createWebSession(userId: string, ttlDays: number): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken(48);
    const tokenHash = await sha256Hex(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * MS_PER_DAY);

    await this.db.insert(sessions).values({
      id: newId(),
      userId,
      tokenHash,
      expiresAt,
    });

    return { token, expiresAt };
  }

  async invalidateWebSession(sessionToken: string): Promise<void> {
    const tokenHash = await sha256Hex(sessionToken);
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async getSessionUserByToken(sessionToken: string): Promise<SessionUser | null> {
    const tokenHash = await sha256Hex(sessionToken);
    const now = new Date();

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        userPreferences: users.userPreferences,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);

    return rows[0] ?? null;
  }

  // ── API tokens ────────────────────────────────────────────────────────────

  async issueApiTokens(userId: string): Promise<{
    accessToken: string;
    accessTokenExpiresIn: number;
    accessTokenExpiresAt: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
  }> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessExp = nowSeconds + this.config.jwtAccessTtlSeconds;
    const refresh = await this._createRefreshTokenRecord(userId, this.config.refreshTokenTtlDays);

    const accessToken = await signAccessToken(
      {
        sub: userId,
        sid: refresh.id,
        scope: DEFAULT_TOKEN_SCOPE,
        iss: this.config.jwtIssuer,
        aud: this.config.jwtAudience,
        iat: nowSeconds,
        exp: accessExp,
      },
      this.config.jwtAccessSecret,
    );

    return {
      accessToken,
      accessTokenExpiresIn: this.config.jwtAccessTtlSeconds,
      accessTokenExpiresAt: new Date(accessExp * 1000).toISOString(),
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    };
  }

  async refreshApiTokens(refreshToken: string): Promise<{
    accessToken: string;
    accessTokenExpiresIn: number;
    accessTokenExpiresAt: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
  } | null> {
    const refreshTokenHash = await sha256Hex(refreshToken);
    const now = new Date();

    const rows = await this.db
      .select({ id: refreshTokens.id, userId: refreshTokens.userId })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, refreshTokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const replacement = await this._createRefreshTokenRecord(row.userId, this.config.refreshTokenTtlDays);

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now, replacedByTokenId: replacement.id })
      .where(eq(refreshTokens.id, row.id));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessExp = nowSeconds + this.config.jwtAccessTtlSeconds;
    const accessToken = await signAccessToken(
      {
        sub: row.userId,
        sid: replacement.id,
        scope: DEFAULT_TOKEN_SCOPE,
        iss: this.config.jwtIssuer,
        aud: this.config.jwtAudience,
        iat: nowSeconds,
        exp: accessExp,
      },
      this.config.jwtAccessSecret,
    );

    return {
      accessToken,
      accessTokenExpiresIn: this.config.jwtAccessTtlSeconds,
      accessTokenExpiresAt: new Date(accessExp * 1000).toISOString(),
      refreshToken: replacement.token,
      refreshTokenExpiresAt: replacement.expiresAt.toISOString(),
    };
  }

  async revokeApiRefreshToken(refreshToken: string): Promise<void> {
    const refreshTokenHash = await sha256Hex(refreshToken);
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, refreshTokenHash), isNull(refreshTokens.revokedAt)));
  }

  // ── Access token verification ─────────────────────────────────────────────

  async getUserFromAccessToken(accessToken: string): Promise<SessionUser | null> {
    const claims = await verifyAccessToken(
      accessToken,
      this.config.jwtAccessSecret,
      this.config.jwtIssuer,
      this.config.jwtAudience,
    );

    if (!claims) {
      return null;
    }

    return { id: claims.sub };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _createRefreshTokenRecord(
    userId: string,
    ttlDays: number,
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const token = randomToken(48);
    const tokenHash = await sha256Hex(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * MS_PER_DAY);
    const id = newId();

    await this.db.insert(refreshTokens).values({ id, userId, tokenHash, expiresAt });

    return { id, token, expiresAt };
  }
}
