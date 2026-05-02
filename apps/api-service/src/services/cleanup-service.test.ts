import { refreshTokens, sessions } from "@/db/schema";
import { CleanupService } from "@/services/cleanup-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("CleanupService", () => {
  let mock: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mock = createMockDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T03:00:00Z"));
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

    it("returns 0 when no expired sessions exist", async () => {
      mock.mockResult.rowCount = 0;
      const service = new CleanupService(mock.db);

      const count = await service.deleteExpiredSessions();

      expect(count).toBe(0);
    });

    it("returns 0 when rowCount is null", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: testing null rowCount edge case
      mock.mockResult.rowCount = null as any;
      const service = new CleanupService(mock.db);

      const count = await service.deleteExpiredSessions();

      expect(count).toBe(0);
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
      // 3 delete calls: sessions, expired refresh tokens, revoked refresh tokens
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
