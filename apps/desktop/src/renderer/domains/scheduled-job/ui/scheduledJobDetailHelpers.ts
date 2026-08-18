/** Returns a human-readable summary for a cron expression used by scheduled jobs. */
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
