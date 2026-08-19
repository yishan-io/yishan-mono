import { describe, expect, it } from "vitest";
import {
  SCHEDULED_JOB_AGENT_KIND,
  inferScheduleFromCron,
  parseCronExpression,
  toCronExpression,
} from "./scheduledJobScheduleRules";

describe("scheduledJobScheduleRules cron rules (stay in Model after P30)", () => {
  it("pins the scheduled-job agent kind to pi", () => {
    expect(SCHEDULED_JOB_AGENT_KIND).toBe("pi");
  });

  it("converts schedule UI state to 5-field cron expressions", () => {
    expect(toCronExpression("daily", "09:30", "1")).toBe("30 9 * * *");
    expect(toCronExpression("weekly", "18:05", "3")).toBe("5 18 * * 3");
    expect(toCronExpression("weekday", "08:00", "1")).toBe("0 8 * * 1-5");
    expect(toCronExpression("hourly", "00:15", "1")).toBe("15 * * * *");
    expect(toCronExpression("custom", "12:00", "1")).toBe("0 12 * * 1-5");
  });

  it("clamps out-of-range schedule times", () => {
    expect(toCronExpression("daily", "99:99", "1")).toBe("59 23 * * *");
    expect(toCronExpression("daily", "abc:def", "1")).toBe("0 9 * * *");
  });

  it("infers schedule UI state from cron expressions", () => {
    expect(inferScheduleFromCron("30 9 * * *")).toEqual({
      scheduleType: "daily",
      scheduleTime: "09:30",
      weeklyDay: "1",
    });
    expect(inferScheduleFromCron("0 8 * * 1-5")).toEqual({
      scheduleType: "weekday",
      scheduleTime: "08:00",
      weeklyDay: "1",
    });
    expect(inferScheduleFromCron("5 18 * * 3")).toEqual({
      scheduleType: "weekly",
      scheduleTime: "18:05",
      weeklyDay: "3",
    });
    expect(inferScheduleFromCron("15 * * * *")).toEqual({
      scheduleType: "hourly",
      scheduleTime: "00:15",
      weeklyDay: "1",
    });
    expect(inferScheduleFromCron("0 0 1 1 *")).toEqual({
      scheduleType: "custom",
      scheduleTime: "00:00",
      weeklyDay: "1",
    });
  });

  it("parses a valid 5-field cron expression into value sets", () => {
    const parsed = parseCronExpression("30 9 * * 1-5");
    expect(parsed?.minute).toEqual(new Set([30]));
    expect(parsed?.hour).toEqual(new Set([9]));
    expect(parsed?.dayOfWeek.has(1)).toBe(true);
    expect(parsed?.dayOfWeek.has(5)).toBe(true);
    expect(parsed?.dayOfWeek.has(6)).toBe(false);
  });

  it("rejects malformed cron expressions", () => {
    expect(parseCronExpression("")).toBeNull();
    expect(parseCronExpression("60 9 * * *")).toBeNull();
    expect(parseCronExpression("30 9 * * 7")).toBeNull();
    expect(parseCronExpression("30 9 * *")).toBeNull();
    expect(parseCronExpression("a b c d e")).toBeNull();
  });
});
