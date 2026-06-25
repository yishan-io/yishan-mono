import { refreshTokens, sessions } from "@/db/schema";
import { CleanupService } from "@/services/cleanup-service";
import { and, isNotNull, lt } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-06-15T03:00:00Z");

function createMockDb() {
  const mockResult = { rowCount: 0 };
  const mockWhere = vi.fn().mockResolvedValue(mockResult);
  const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });

  return {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    db: { delete: mockDelete } as any,
    mockDelete,
    mockWhere,
    mockResult,
  };
}

/** Serialise a Drizzle SQL expression to a stable string for comparison. */
function toSqlString(expr: unknown): string {
  // biome-ignore lint/suspicious/noExplicitAny: introspecting Drizzle SQL object
  const e = expr as any;
  if (!e || !Array.isArray(e.queryChunks)) return String(expr);
  return JSON.stringify(e.queryChunks.map((c: unknown) => String(c)));
}

describe("CleanupService", () => {
  let mock: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mock = createMockDb();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  describe("deleteExpiredSessions", () => {
    it("deletes from the sessions table", async () => {
      mock.mockResult.rowCount = 5;
      const service = new CleanupService(mock.db);

      const count = await service.deleteExpiredSessions();

      expect(count).toBe(5);
      expect(mock.mockDelete).toHaveBeenCalledWith(sessions);
      expect(mock.mockWhere).toHaveBeenCalledTimes(1);
    });

    it("uses lt (less-than) on sessions.expiresAt, not gt", async () => {
      const service = new CleanupService(mock.db);
      await service.deleteExpiredSessions();

      const actualWhereArg = mock.mockWhere.mock.calls[0]?.[0];
      const expectedExpr = lt(sessions.expiresAt, NOW);

      // Both expressions must use the same operator direction (<, not >)
      expect(toSqlString(actualWhereArg)).toBe(toSqlString(expectedExpr));
    });

    it("returns 0 when no expired sessions exist", async () => {
      mock.mockResult.rowCount = 0;
      const service = new CleanupService(mock.db);

      expect(await service.deleteExpiredSessions()).toBe(0);
    });

    it("returns 0 when rowCount is null", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: testing null rowCount edge case
      mock.mockResult.rowCount = null as any;
      const service = new CleanupService(mock.db);

      expect(await service.deleteExpiredSessions()).toBe(0);
    });
  });

  describe("deleteExpiredRefreshTokens", () => {
    it("deletes from the refreshTokens table", async () => {
      mock.mockResult.rowCount = 3;
      const service = new CleanupService(mock.db);

      const count = await service.deleteExpiredRefreshTokens();

      expect(count).toBe(3);
      expect(mock.mockDelete).toHaveBeenCalledWith(refreshTokens);
      expect(mock.mockWhere).toHaveBeenCalledTimes(1);
    });

    it("uses lt (less-than) on refreshTokens.expiresAt, not gt", async () => {
      const service = new CleanupService(mock.db);
      await service.deleteExpiredRefreshTokens();

      const actualWhereArg = mock.mockWhere.mock.calls[0]?.[0];
      const expectedExpr = lt(refreshTokens.expiresAt, NOW);

      expect(toSqlString(actualWhereArg)).toBe(toSqlString(expectedExpr));
    });
  });

  describe("deleteOldRevokedRefreshTokens", () => {
    it("deletes from the refreshTokens table with default 30-day retention", async () => {
      mock.mockResult.rowCount = 2;
      const service = new CleanupService(mock.db);

      const count = await service.deleteOldRevokedRefreshTokens();

      expect(count).toBe(2);
      expect(mock.mockDelete).toHaveBeenCalledWith(refreshTokens);
      expect(mock.mockWhere).toHaveBeenCalledTimes(1);
    });

    it("uses lt (less-than) on revokedAt, not gt (catches direction inversion)", async () => {
      const service = new CleanupService(mock.db);
      await service.deleteOldRevokedRefreshTokens();

      const actualWhereArg = mock.mockWhere.mock.calls[0]?.[0];

      // The cutoff is NOW - 30 days
      const cutoff = new Date(NOW);
      cutoff.setDate(cutoff.getDate() - 30);
      const expectedExpr = and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, cutoff));

      expect(toSqlString(actualWhereArg)).toBe(toSqlString(expectedExpr));
    });

    it("respects custom retention days", async () => {
      mock.mockResult.rowCount = 7;
      const service = new CleanupService(mock.db, 90);

      const count = await service.deleteOldRevokedRefreshTokens();

      expect(count).toBe(7);
      expect(mock.mockDelete).toHaveBeenCalledWith(refreshTokens);
    });
  });

  describe("runAll", () => {
    it("runs all cleanup operations and returns aggregate results", async () => {
      let callCount = 0;
      const rowCounts = [10, 5, 3];
      mock.mockWhere.mockImplementation(() => Promise.resolve({ rowCount: rowCounts[callCount++] }));

      const service = new CleanupService(mock.db);
      const result = await service.runAll();

      expect(result).toEqual({
        deletedSessions: 10,
        deletedExpiredRefreshTokens: 5,
        deletedRevokedRefreshTokens: 3,
      });
      expect(mock.mockDelete).toHaveBeenCalledTimes(3);
      expect(mock.mockDelete).toHaveBeenNthCalledWith(1, sessions);
      expect(mock.mockDelete).toHaveBeenNthCalledWith(2, refreshTokens);
      expect(mock.mockDelete).toHaveBeenNthCalledWith(3, refreshTokens);
    });

    it("returns zeros when nothing to clean", async () => {
      const service = new CleanupService(mock.db);
      const result = await service.runAll();

      expect(result).toEqual({
        deletedSessions: 0,
        deletedExpiredRefreshTokens: 0,
        deletedRevokedRefreshTokens: 0,
      });
    });
  });
});
