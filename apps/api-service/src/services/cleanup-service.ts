import { and, isNotNull, lt } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { refreshTokens, sessions } from "@/db/schema";

/**
 * Default retention period (in days) for soft-revoked refresh tokens.
 * Revoked tokens older than this are permanently deleted.
 */
const DEFAULT_REVOKED_RETENTION_DAYS = 30;

export type CleanupResult = {
  deletedSessions: number;
  deletedExpiredRefreshTokens: number;
  deletedRevokedRefreshTokens: number;
};

export class CleanupService {
  constructor(
    private readonly db: AppDb,
    private readonly revokedRetentionDays: number = DEFAULT_REVOKED_RETENTION_DAYS,
  ) {}

  /**
   * Remove all expired sessions where `expires_at < now()`.
   */
  async deleteExpiredSessions(): Promise<number> {
    const now = new Date();
    const result = await this.db.delete(sessions).where(lt(sessions.expiresAt, now));
    return result.rowCount ?? 0;
  }

  /**
   * Remove all expired refresh tokens where `expires_at < now()`.
   */
  async deleteExpiredRefreshTokens(): Promise<number> {
    const now = new Date();
    const result = await this.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now));
    return result.rowCount ?? 0;
  }

  /**
   * Remove soft-revoked refresh tokens that are older than the retention window.
   * These are tokens where `revoked_at IS NOT NULL` and `revoked_at` is older
   * than `now() - revokedRetentionDays`.
   */
  async deleteOldRevokedRefreshTokens(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.revokedRetentionDays);

    const result = await this.db
      .delete(refreshTokens)
      .where(and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, cutoff)));
    return result.rowCount ?? 0;
  }

  /**
   * Run all cleanup operations and return aggregate results.
   */
  async runAll(): Promise<CleanupResult> {
    const deletedSessions = await this.deleteExpiredSessions();
    const deletedExpiredRefreshTokens = await this.deleteExpiredRefreshTokens();
    const deletedRevokedRefreshTokens = await this.deleteOldRevokedRefreshTokens();

    return {
      deletedSessions,
      deletedExpiredRefreshTokens,
      deletedRevokedRefreshTokens,
    };
  }
}
