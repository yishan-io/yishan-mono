import type { AppDb } from "@/db/client";
import { handleCleanup } from "@/scheduled/cleanup";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAll: vi.fn(),
  terminalizeStaleRuns: vi.fn(),
}));

vi.mock("@/services/cleanup-service", () => ({
  CleanupService: class {
    runAll = mocks.runAll;
  },
}));

vi.mock("@/services/job-evaluator-service", () => ({
  JobEvaluatorService: class {
    terminalizeStaleRuns = mocks.terminalizeStaleRuns;
  },
}));

describe("handleCleanup", () => {
  beforeEach(() => {
    mocks.runAll.mockResolvedValue({
      deletedSessions: 0,
      deletedExpiredRefreshTokens: 0,
      deletedRevokedRefreshTokens: 0,
    });
    mocks.terminalizeStaleRuns.mockResolvedValue({ skippedOffline: 1, failed: 1 });
  });

  it("terminalizes stale runs using the daily ten-minute threshold", async () => {
    await handleCleanup({} as AppDb, {});

    expect(mocks.terminalizeStaleRuns).toHaveBeenCalledWith({ staleThresholdMinutes: 10 });
  });
});
