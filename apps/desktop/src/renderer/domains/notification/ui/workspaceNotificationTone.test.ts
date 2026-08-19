import { describe, expect, it } from "vitest";
import { resolveWorkspaceNotificationColor } from "./workspaceNotificationTone";

describe("resolveWorkspaceNotificationColor (desktop8 Phase 30: notification/ui)", () => {
  it.each([
    { tone: "waiting_input", expectedColor: "warning.main" },
    { tone: "failed", expectedColor: "error.main" },
    { tone: "done", expectedColor: "success.main" },
    { tone: "none", expectedColor: "text.secondary" },
  ] as const)("maps $tone to $expectedColor", ({ tone, expectedColor }) => {
    expect(resolveWorkspaceNotificationColor(tone)).toBe(expectedColor);
  });
});
