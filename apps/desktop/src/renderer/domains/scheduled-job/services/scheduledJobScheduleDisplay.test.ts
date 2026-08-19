import { describe, expect, it } from "vitest";
import { computeNextRunEstimate, describeCronExpression } from "./scheduledJobScheduleDisplay";

describe("scheduledJobScheduleRules clock + display parts (move out of Model after P30)", () => {
  it("computes a next-run estimate in the future for a valid cron", () => {
    const before = Date.now();
    const estimate = computeNextRunEstimate("15 * * * *", "UTC");
    expect(estimate?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("rejects step-prefixed cron fields (e.g. */15) — parser only supports *, ranges, and single values", () => {
    expect(computeNextRunEstimate("*/15 * * * *", "UTC")).toBeNull();
  });

  it("returns null for an invalid cron", () => {
    expect(computeNextRunEstimate("not-a-cron", "UTC")).toBeNull();
  });

  it("describes common cron expressions in human text", () => {
    expect(describeCronExpression("0 * * * *")).toBe("Every hour");
    expect(describeCronExpression("0 9 * * 1-5")).toBe("Weekdays at 09:00");
    expect(describeCronExpression("0 18 * * 3")).toBe("Weekly on Wednesday at 18:00");
    expect(describeCronExpression("0 9 * * *")).toBe("Daily at 09:00");
    expect(describeCronExpression("custom")).toBe("Custom schedule");
  });
});
