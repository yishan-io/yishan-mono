import type { AgentKind } from "@yishan-io/core";

/**
 * Scheduled-job schedule rules (desktop7 Phase 26).
 *
 * Stable Domain semantics: the fixed agent kind for scheduled jobs and the
 * 5-field cron expression rules (parse / infer / to-cron). Next-run
 * estimates and human descriptions live in `../services/scheduledJobScheduleDisplay`
 * (desktop8 Phase 30).
 */

/** Only Pi is supported for scheduled jobs — the agent list is intentionally removed. */
export const SCHEDULED_JOB_AGENT_KIND: AgentKind = "pi";

export type ScheduleType = "daily" | "weekly" | "weekday" | "hourly" | "custom";

/** Converts schedule UI state to a 5-field cron expression. */
export function toCronExpression(scheduleType: ScheduleType, scheduleTime: string, weeklyDay: string): string {
  const [hourString, minuteString] = scheduleTime.split(":");
  const hour = Number.parseInt(hourString ?? "9", 10);
  const minute = Number.parseInt(minuteString ?? "0", 10);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;

  if (scheduleType === "daily") {
    return `${safeMinute} ${safeHour} * * *`;
  }
  if (scheduleType === "weekly") {
    return `${safeMinute} ${safeHour} * * ${weeklyDay}`;
  }
  if (scheduleType === "weekday") {
    return `${safeMinute} ${safeHour} * * 1-5`;
  }
  if (scheduleType === "hourly") {
    return `${safeMinute} * * * *`;
  }
  return `${safeMinute} ${safeHour} * * 1-5`;
}

/** Infers schedule UI state from a 5-field cron expression. */
export function inferScheduleFromCron(cronExpression: string): {
  scheduleType: ScheduleType;
  scheduleTime: string;
  weeklyDay: string;
} {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { scheduleType: "custom", scheduleTime: "09:00", weeklyDay: "1" };
  }

  const minute = parts[0] ?? "0";
  const hour = parts[1] ?? "9";
  const dayOfWeek = parts[4] ?? "*";
  const time = `${String(Number.parseInt(hour, 10) || 0).padStart(2, "0")}:${String(Number.parseInt(minute, 10) || 0).padStart(2, "0")}`;

  if (parts[2] === "*" && parts[3] === "*" && dayOfWeek === "*" && /^\d+$/.test(hour)) {
    return { scheduleType: "daily", scheduleTime: time, weeklyDay: "1" };
  }
  if (parts[2] === "*" && parts[3] === "*" && dayOfWeek === "1-5" && /^\d+$/.test(hour)) {
    return { scheduleType: "weekday", scheduleTime: time, weeklyDay: "1" };
  }
  if (parts[2] === "*" && parts[3] === "*" && /^\d$/.test(dayOfWeek) && /^\d+$/.test(hour)) {
    return { scheduleType: "weekly", scheduleTime: time, weeklyDay: dayOfWeek };
  }
  if (parts[2] === "*" && parts[3] === "*" && dayOfWeek === "*" && hour === "*") {
    return {
      scheduleType: "hourly",
      scheduleTime: `00:${String(Number.parseInt(minute, 10) || 0).padStart(2, "0")}`,
      weeklyDay: "1",
    };
  }

  return { scheduleType: "custom", scheduleTime: time, weeklyDay: "1" };
}

function parseCronFieldPart(part: string, min: number, max: number): Set<number> | null {
  const normalized = part.trim();
  if (!normalized) {
    return null;
  }

  const values = new Set<number>();
  const segments = normalized.split(",");

  for (const segment of segments) {
    const token = segment.trim();
    if (!token) {
      return null;
    }

    if (token === "*") {
      for (let value = min; value <= max; value += 1) {
        values.add(value);
      }
      continue;
    }

    if (token.includes("-")) {
      const [startPart, endPart] = token.split("-");
      const start = Number.parseInt(startPart ?? "", 10);
      const end = Number.parseInt(endPart ?? "", 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < min || end > max) {
        return null;
      }
      for (let value = start; value <= end; value += 1) {
        values.add(value);
      }
      continue;
    }

    const numeric = Number.parseInt(token, 10);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
      return null;
    }
    values.add(numeric);
  }

  return values;
}

/** Parses a 5-field cron expression into sets of allowed values per field. */
export function parseCronExpression(cronExpression: string): {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
} | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const minute = parseCronFieldPart(parts[0] ?? "", 0, 59);
  const hour = parseCronFieldPart(parts[1] ?? "", 0, 23);
  const dayOfMonth = parseCronFieldPart(parts[2] ?? "", 1, 31);
  const month = parseCronFieldPart(parts[3] ?? "", 1, 12);
  const dayOfWeek = parseCronFieldPart(parts[4] ?? "", 0, 6);

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return null;
  }

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}
