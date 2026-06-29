import { describe, expect, it } from "vitest";
import { resolveLocalCalendarDate, shouldSuppressAutoUpdateEvent } from "./autoUpdateDismissalState";

describe("autoUpdateDismissalState", () => {
  it("formats the local calendar date as YYYY-MM-DD", () => {
    const date = new Date(2026, 5, 29, 18, 45, 12);

    expect(resolveLocalCalendarDate(date)).toBe("2026-06-29");
  });

  it("suppresses only auto update availability on the dismissed day", () => {
    const now = new Date(2026, 5, 29, 9, 0, 0);

    expect(
      shouldSuppressAutoUpdateEvent({ status: "available", source: "auto", version: "1.2.3" }, "2026-06-29", now),
    ).toBe(true);
    expect(
      shouldSuppressAutoUpdateEvent({ status: "available", source: "manual", version: "1.2.3" }, "2026-06-29", now),
    ).toBe(false);
    expect(shouldSuppressAutoUpdateEvent({ status: "downloaded", version: "1.2.3" }, "2026-06-29", now)).toBe(false);
    expect(
      shouldSuppressAutoUpdateEvent({ status: "available", source: "auto", version: "1.2.3" }, "2026-06-28", now),
    ).toBe(false);
  });

  it("stops suppressing once the local day changes", () => {
    expect(
      shouldSuppressAutoUpdateEvent(
        { status: "available", source: "auto", version: "1.2.3" },
        "2026-06-29",
        new Date(2026, 5, 30, 9, 0, 0),
      ),
    ).toBe(false);
  });
});
