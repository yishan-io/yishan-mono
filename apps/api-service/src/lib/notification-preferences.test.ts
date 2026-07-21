import { describe, expect, it } from "vitest";
import {
  CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  normalizeNotificationPreferences,
} from "./notification-preferences";

describe("normalizeNotificationPreferences", () => {
  it("enables newly added notification events for existing preference snapshots", () => {
    const preferences = normalizeNotificationPreferences({
      enabled: true,
      osEnabled: true,
      soundEnabled: true,
      volume: 0.7,
      focusOnClick: true,
      enabledEventTypes: ["run-finished", "run-failed"],
      eventSounds: {
        "run-finished": "chime",
        "run-failed": "alert",
      },
    });

    expect(preferences.enabledEventTypes).toContain("pending-question");
    expect(preferences.eventSounds["pending-question"]).toBe("ping");
    expect(preferences.schemaVersion).toBe(CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION);
  });
});
