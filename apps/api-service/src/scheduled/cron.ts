const WEEKDAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

/** Maximum cron scan window: ~400 days of per-minute steps. */
const MAX_CRON_SCAN_MINUTES = 60 * 24 * 400;

const FIELD_BOUNDS = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
} as const;

type FieldName = keyof typeof FIELD_BOUNDS;

type CronField = {
  values: Set<number>;
  any: boolean;
};

export type ParsedCron = {
  source: string;
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

// --- Parsing helpers ---

function toNumber(value: string, min: number, max: number, label: string): number {
  const name = WEEKDAY_NAMES[value.toUpperCase()];
  if (name !== undefined) return name;

  if (!/^\d+$/.test(value)) {
    throw new Error(`${label}: "${value}" is not a number`);
  }
  const n = Number(value);
  if (n < min || n > max) {
    throw new Error(`${label}: ${n} is out of range ${min}-${max}`);
  }
  return n;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/**
 * Expand a single cron token (e.g. "5", "1-3", "MON-FRI", "* /10", "1-30/5")
 * into the set of matching values.
 */
function expandToken(token: string, min: number, max: number, label: string): number[] {
  const [basePart, stepPart] = token.split("/");
  if (!basePart) throw new Error(`${label}: empty token`);

  const step = stepPart !== undefined ? toNumber(stepPart, 1, max, `${label} step`) : null;

  let values: number[];
  if (basePart === "*") {
    values = range(min, max);
  } else if (basePart.includes("-")) {
    const [startRaw, endRaw] = basePart.split("-");
    if (!startRaw || !endRaw) throw new Error(`${label}: bad range "${basePart}"`);
    const start = toNumber(startRaw, min, max, label);
    const end = toNumber(endRaw, min, max, label);
    if (end < start) throw new Error(`${label}: range end < start`);
    values = range(start, end);
  } else {
    values = [toNumber(basePart, min, max, label)];
  }

  if (step === null) return values;

  const start = values[0]!;
  return values.filter((v) => (v - start) % step === 0);
}

function parseField(input: string, name: FieldName): CronField {
  const trimmed = input.trim();
  const { min, max } = FIELD_BOUNDS[name];

  if (trimmed === "*") {
    return { values: new Set(), any: true };
  }

  const values = new Set<number>();
  for (const part of trimmed.split(",")) {
    const token = part.trim();
    if (!token) throw new Error(`${name}: empty value in list`);
    for (const v of expandToken(token, min, max, name)) {
      values.add(v);
    }
  }

  if (values.size === 0) throw new Error(`${name}: resolves to no values`);
  return { values, any: false };
}

// --- Public API ---

export function parseCronExpression(expression: string): ParsedCron {
  const normalized = expression.trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ");
  if (parts.length !== 5) {
    throw new Error("Cron expression must have exactly 5 fields (minute hour day month weekday)");
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [string, string, string, string, string];
  return {
    source: normalized,
    minute: parseField(minute, "minute"),
    hour: parseField(hour, "hour"),
    dayOfMonth: parseField(dayOfMonth, "dayOfMonth"),
    month: parseField(month, "month"),
    dayOfWeek: parseField(dayOfWeek, "dayOfWeek"),
  };
}

export function ensureTimezoneSupported(timezone: string): string {
  const trimmed = timezone.trim();
  if (!trimmed) throw new Error("Timezone must not be empty");

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
  } catch {
    throw new Error(`Unsupported timezone: ${trimmed}`);
  }
  return trimmed;
}

export function computeNextRunAt(parsed: ParsedCron, timezone: string, fromDate: Date): Date {
  const cursor = new Date(fromDate.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  // Scan up to ~400 days of minutes
  const maxMinutes = MAX_CRON_SCAN_MINUTES;
  for (let i = 0; i < maxMinutes; i++) {
    if (matchesCron(parsed, cursor, timezone)) {
      return new Date(cursor.getTime());
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  throw new Error("Unable to compute next run — no match within 400 days");
}

// --- Matching ---

function matchesCron(parsed: ParsedCron, date: Date, timezone: string): boolean {
  const p = toTimezoneParts(date, timezone);
  if (p.second !== 0) return false;

  return (
    matches(parsed.minute, p.minute) &&
    matches(parsed.hour, p.hour) &&
    matches(parsed.dayOfMonth, p.day) &&
    matches(parsed.month, p.month) &&
    matches(parsed.dayOfWeek, p.weekday)
  );
}

function matches(field: CronField, value: number): boolean {
  return field.any || field.values.has(value);
}

function toTimezoneParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = new Map(fmt.formatToParts(date).map((p) => [p.type, p.value]));

  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));
  const second = Number(parts.get("second"));

  if ([year, month, day, hour, minute, second].some((v) => !Number.isFinite(v))) {
    throw new Error("Failed to resolve date parts for timezone");
  }

  const weekdayRaw = parts.get("weekday")?.toUpperCase();
  const weekday = weekdayRaw ? (WEEKDAY_NAMES[weekdayRaw] ?? -1) : -1;
  if (weekday < 0 || weekday > 6) {
    throw new Error("Failed to resolve weekday for timezone");
  }

  return { year, month, day, hour, minute, second, weekday };
}
