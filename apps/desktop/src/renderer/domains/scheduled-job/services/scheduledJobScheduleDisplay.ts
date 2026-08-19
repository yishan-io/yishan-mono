import { parseCronExpression } from "../scheduledJobScheduleRules";

/**
 * Scheduled-job schedule display (desktop8 Phase 30).
 *
 * Clock-based next-run estimates and human-readable cron descriptions moved
 * out of the Model into Services: the Model keeps pure cron parsing rules
 * only. Both hooks and Features consume this module.
 */

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
