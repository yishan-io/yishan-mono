import { refreshTokens } from "@/db/schema";
import { AuthService } from "@/services/auth-service";
import type { ServiceConfig } from "@/types";
import { describe, expect, it, vi } from "vitest";

const refreshTokenExpiry = new Date("2026-08-01T00:00:00Z");

function createMockDb() {
  const mockLimit = vi.fn().mockResolvedValue([{ id: "refresh-1", userId: "user-1", expiresAt: refreshTokenExpiry }]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();

  return {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    db: { select: mockSelect, insert: mockInsert, update: mockUpdate } as any,
    mockInsert,
    mockUpdate,
  };
}

const serviceConfig = {
  jwtAccessSecret: "test-access-secret",
  jwtAccessTtlSeconds: 900,
  jwtIssuer: "https://api.yishan.test",
  jwtAudience: "api-service",
} as ServiceConfig;

describe("AuthService.refreshApiTokens", () => {
  it("retains the existing refresh token and expiry", async () => {
    const mock = createMockDb();
    const service = new AuthService(mock.db, serviceConfig, {} as never);

    const result = await service.refreshApiTokens("existing-refresh-token");

    expect(result).toEqual(
      expect.objectContaining({
        refreshToken: "existing-refresh-token",
        refreshTokenExpiresAt: refreshTokenExpiry.toISOString(),
      }),
    );
    expect(mock.mockInsert).not.toHaveBeenCalled();
    expect(mock.mockUpdate).not.toHaveBeenCalledWith(refreshTokens);
  });
});
