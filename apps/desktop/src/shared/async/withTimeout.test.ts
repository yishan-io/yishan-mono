import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  it("resolves when promise settles before timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1_000)).resolves.toBe("ok");
  });

  it("rejects with original error when promise rejects before timeout", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1_000)).rejects.toThrow("boom");
  });

  it("rejects when timeout is exceeded", async () => {
    vi.useFakeTimers();
    try {
      const pendingPromise = withTimeout(new Promise<void>(() => {}), 1_000, "timeout-hit");
      const rejectionExpectation = expect(pendingPromise).rejects.toThrow("timeout-hit");
      await vi.advanceTimersByTimeAsync(1_000);
      await rejectionExpectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
