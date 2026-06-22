import { describe, expect, it } from "vitest";

import { normalizeMeUser } from "./me-domain";

describe("me-domain", () => {
  it("normalizes the current-user response into the feature-owned me shape", () => {
    expect(
      normalizeMeUser({
        avatarUrl: "https://example.com/avatar.png",
        email: "jay@example.com",
        id: "user-1",
        languagePreference: "zh",
        name: "Jay",
        notificationPreferences: {
          enabledCategories: ["ai-task"],
          enabledEventTypes: ["run-finished", "pending-question"],
          enabled: true,
          eventSounds: {
            "pending-question": "alert",
            "run-failed": "zip",
            "run-finished": "chime",
          },
          focusOnClick: true,
          osEnabled: false,
          schemaVersion: 1,
          soundEnabled: true,
          volume: 0.7,
        },
      }),
    ).toEqual({
      avatarUrl: "https://example.com/avatar.png",
      email: "jay@example.com",
      id: "user-1",
      languagePreference: "zh",
      name: "Jay",
      notificationPreferences: {
        enabledCategories: ["ai-task"],
        enabledEventTypes: ["run-finished", "pending-question"],
        enabled: true,
        eventSounds: {
          "pending-question": "alert",
          "run-failed": "zip",
          "run-finished": "chime",
        },
        focusOnClick: true,
        osEnabled: false,
        schemaVersion: 1,
        soundEnabled: true,
        volume: 0.7,
      },
    });
  });
});
