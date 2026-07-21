import { describe, expect, it } from "vitest";

import { describeCronExpression } from "./scheduledJobDetailHelpers";

describe("describeCronExpression", () => {
  it("returns hourly text for top-of-hour schedules", () => {
    expect(describeCronExpression("0 * * * *")).toBe("Every hour");
  });

  it("returns weekday text for weekday schedules", () => {
    expect(describeCronExpression("15 9 * * 1-5")).toBe("Weekdays at 09:15");
  });

  it("returns weekly text for single weekday schedules", () => {
    expect(describeCronExpression("30 7 * * 2")).toBe("Weekly on Tuesday at 07:30");
  });

  it("returns daily text for daily schedules", () => {
    expect(describeCronExpression("45 6 * * *")).toBe("Daily at 06:45");
  });

  it("falls back to custom schedule for non-daily monthly schedules", () => {
    expect(describeCronExpression("0 12 1 * *")).toBe("Custom schedule");
  });

  it("falls back to custom schedule for malformed expressions", () => {
    expect(describeCronExpression("0 12 * *")).toBe("Custom schedule");
  });
});
