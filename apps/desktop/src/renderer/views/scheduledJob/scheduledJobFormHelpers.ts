import type { DesktopAgentKind } from "../../helpers/agentSettings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduledJobFormDraft = {
  name: string;
  projectId: string;
  nodeId: string;
  agentKind: DesktopAgentKind;
  cronExpression: string;
  prompt: string;
  timezone: string;
};

export type ScheduleType = "daily" | "weekly" | "weekday" | "hourly" | "custom";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** IANA timezone names supported by the current JS runtime. */
export const TIMEZONE_OPTIONS: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; labelKey: string }[] = [
  { value: "daily", labelKey: "scheduledJob.form.scheduleTypes.daily" },
  { value: "weekly", labelKey: "scheduledJob.form.scheduleTypes.weekly" },
  { value: "weekday", labelKey: "scheduledJob.form.scheduleTypes.weekday" },
  { value: "hourly", labelKey: "scheduledJob.form.scheduleTypes.hourly" },
  { value: "custom", labelKey: "scheduledJob.form.scheduleTypes.custom" },
];

export const WEEKDAY_OPTIONS = [
  { value: "1", labelKey: "scheduledJob.form.weekdays.monday" },
  { value: "2", labelKey: "scheduledJob.form.weekdays.tuesday" },
  { value: "3", labelKey: "scheduledJob.form.weekdays.wednesday" },
  { value: "4", labelKey: "scheduledJob.form.weekdays.thursday" },
  { value: "5", labelKey: "scheduledJob.form.weekdays.friday" },
  { value: "6", labelKey: "scheduledJob.form.weekdays.saturday" },
  { value: "0", labelKey: "scheduledJob.form.weekdays.sunday" },
];

export const DEFAULT_FORM_DRAFT: ScheduledJobFormDraft = {
  name: "",
  projectId: "",
  nodeId: "",
  agentKind: "opencode",
  cronExpression: "0 9 * * 1-5",
  prompt: "",
  timezone: "UTC",
};

// ---------------------------------------------------------------------------
// Cron helpers
// ---------------------------------------------------------------------------

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

const TIMEZONE_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getDateTimePartsForTimezone(date: Date, timezone: string) {
  let formatter = TIMEZONE_PARTS_FORMATTER_CACHE.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    TIMEZONE_PARTS_FORMATTER_CACHE.set(timezone, formatter);
  }

  const parts = formatter.formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  const weekdayText = valueByType.get("weekday") ?? "Sun";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    month: Number.parseInt(valueByType.get("month") ?? "1", 10),
    day: Number.parseInt(valueByType.get("day") ?? "1", 10),
    hour: Number.parseInt(valueByType.get("hour") ?? "0", 10),
    minute: Number.parseInt(valueByType.get("minute") ?? "0", 10),
    weekday: weekdayMap[weekdayText] ?? 0,
  };
}

/** Computes the next estimated run time from now based on cron + timezone. */
export function computeNextRunEstimate(cronExpression: string, timezone: string): Date | null {
  const parsedCron = parseCronExpression(cronExpression);
  if (!parsedCron) {
    return null;
  }

  const now = new Date();
  const cursor = new Date(now);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let iteration = 0; iteration < 60 * 24 * 365; iteration += 1) {
    const parts = getDateTimePartsForTimezone(cursor, timezone);
    if (
      parsedCron.minute.has(parts.minute) &&
      parsedCron.hour.has(parts.hour) &&
      parsedCron.dayOfMonth.has(parts.day) &&
      parsedCron.month.has(parts.month) &&
      parsedCron.dayOfWeek.has(parts.weekday)
    ) {
      return new Date(cursor);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

/** Returns a human-readable description of a cron expression. */
export function describeCronExpression(cronExpression: string): string {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return "Custom schedule";
  }

  const minute = parts[0] ?? "*";
  const hour = parts[1] ?? "*";
  const dayOfMonth = parts[2] ?? "*";
  const month = parts[3] ?? "*";
  const dayOfWeek = parts[4] ?? "*";
  const minuteText = String(minute).padStart(2, "0");
  const hourText = String(hour).padStart(2, "0");

  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every hour";
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    return `Weekdays at ${hourText}:${minuteText}`;
  }
  if (dayOfMonth === "*" && month === "*" && /^\d$/.test(dayOfWeek)) {
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekdayName = weekdayNames[Number.parseInt(dayOfWeek, 10)] ?? `day ${dayOfWeek}`;
    return `Weekly on ${weekdayName} at ${hourText}:${minuteText}`;
  }
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${hourText}:${minuteText}`;
  }

  return "Custom schedule";
}
