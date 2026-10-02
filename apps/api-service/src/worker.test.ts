import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleCleanup: vi.fn(),
  runWithScheduledDb: vi.fn(),
}));

vi.mock("@/app", () => ({ app: { fetch: vi.fn() } }));
vi.mock("@/scheduled/cleanup", () => ({ handleCleanup: mocks.handleCleanup }));
vi.mock("@/scheduled/db", () => ({ runWithScheduledDb: mocks.runWithScheduledDb }));

import worker from "@/worker";

const DAILY_CLEANUP_CRON = "0 3 * * *";

function createContext() {
  return { waitUntil: vi.fn() } as unknown as ExecutionContext;
}

describe("worker scheduled handler", () => {
  beforeEach(() => {
    mocks.handleCleanup.mockReset();
    mocks.runWithScheduledDb.mockReset();
  });

  it("runs cleanup only for the explicit daily cron", async () => {
    const context = createContext();
    mocks.runWithScheduledDb.mockImplementation(
      async (_env: unknown, _name: string, callback: (db: unknown) => Promise<void>) => callback({}),
    );

    await worker.scheduled({ cron: DAILY_CLEANUP_CRON } as ScheduledEvent, {}, context);

    expect(mocks.runWithScheduledDb).toHaveBeenCalledWith({}, "cleanup", expect.any(Function));
    expect(context.waitUntil).toHaveBeenCalledTimes(1);
  });

  it.each(["*/5 * * * *", "0 * * * *"])("ignores the unconfigured %s cron", async (cron) => {
    const context = createContext();

    await worker.scheduled({ cron } as ScheduledEvent, {}, context);

    expect(mocks.runWithScheduledDb).not.toHaveBeenCalled();
    expect(context.waitUntil).not.toHaveBeenCalled();
  });
});
