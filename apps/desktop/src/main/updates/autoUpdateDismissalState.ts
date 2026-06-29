import type { DesktopUpdateEventPayload } from "../ipc";

/** Returns the local calendar date in YYYY-MM-DD format. */
export function resolveLocalCalendarDate(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns true when the dismissed auto-update date matches today. */
export function isAutoUpdateDismissedToday(dismissedDate: string | null, now = new Date()): boolean {
  return dismissedDate === resolveLocalCalendarDate(now);
}

/** Returns true when an auto update available event should stay hidden for the rest of the day. */
export function shouldSuppressAutoUpdateEvent(
  payload: DesktopUpdateEventPayload,
  dismissedDate: string | null,
  now = new Date(),
): boolean {
  return payload.status === "available" && payload.source === "auto" && isAutoUpdateDismissedToday(dismissedDate, now);
}
