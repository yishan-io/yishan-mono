import { describe, expect, it, vi } from "vitest";

import { UserService } from "@/services/user-service";

function makePersonalLocalTaskKeyDb(options: { existingKey?: string; counter?: number } = {}) {
  const lockUser = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "user-1" }]) });
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ for: lockUser }) }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(options.existingKey ? [{ key: options.existingKey }] : []),
        }),
      }),
    });
  const insert = vi
    .fn()
    .mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi
          .fn()
          .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ lastAllocatedNumber: options.counter ?? 1 }]) }),
      }),
    })
    .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });
  const transaction = vi
    .fn()
    .mockImplementation((operation: (tx: unknown) => unknown) => operation({ select, insert }));

  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  return { db: { transaction } as any, insert, lockUser };
}

describe("UserService.allocatePersonalLocalTaskKey", () => {
  it("locks the authenticated user before allocating to serialize concurrent personal requests", async () => {
    const { db, lockUser } = makePersonalLocalTaskKeyDb();
    const service = new UserService(db);

    await service.allocatePersonalLocalTaskKey({ actorUserId: "user-1", localTaskId: "task-1" });

    expect(lockUser).toHaveBeenCalledWith("update");
  });

  it("is idempotent for a user's Local Task ID", async () => {
    const { db, insert } = makePersonalLocalTaskKeyDb({ existingKey: "PERS-3" });
    const service = new UserService(db);

    await expect(
      service.allocatePersonalLocalTaskKey({ actorUserId: "user-1", localTaskId: "task-1" }),
    ).resolves.toEqual({
      key: "PERS-3",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("allocates PERS keys from the authenticated user's counter", async () => {
    const { db, insert } = makePersonalLocalTaskKeyDb({ counter: 2 });
    const service = new UserService(db);

    await expect(
      service.allocatePersonalLocalTaskKey({ actorUserId: "user-1", localTaskId: "task-2" }),
    ).resolves.toEqual({
      key: "PERS-2",
    });
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
