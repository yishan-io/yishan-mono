import { describe, expect, it } from "vitest";
import { resolveWorkspaceNotificationColor, resolveWorkspaceNotificationTone } from "./workspaceNotification";

describe("resolveWorkspaceNotificationTone", () => {
  it.each([
    { runtimeStatus: "waiting_input", unreadTone: undefined, expectedTone: "waiting_input" },
    { runtimeStatus: "waiting_input", unreadTone: "error", expectedTone: "waiting_input" },
    { runtimeStatus: "waiting_input", unreadTone: "success", expectedTone: "waiting_input" },
    { runtimeStatus: "running", unreadTone: "error", expectedTone: "failed" },
    { runtimeStatus: "running", unreadTone: "success", expectedTone: "done" },
    { runtimeStatus: "running", unreadTone: undefined, expectedTone: "none" },
    { runtimeStatus: "idle", unreadTone: "error", expectedTone: "failed" },
    { runtimeStatus: "idle", unreadTone: "success", expectedTone: "done" },
    { runtimeStatus: "idle", unreadTone: undefined, expectedTone: "none" },
  ] as const)(
    "resolves $runtimeStatus with $unreadTone to $expectedTone",
    ({ runtimeStatus, unreadTone, expectedTone }) => {
      expect(resolveWorkspaceNotificationTone({ runtimeStatus, unreadTone })).toBe(expectedTone);
    },
  );
});

describe("resolveWorkspaceNotificationColor", () => {
  it.each([
    { tone: "waiting_input", expectedColor: "warning.main" },
    { tone: "failed", expectedColor: "error.main" },
    { tone: "done", expectedColor: "success.main" },
    { tone: "none", expectedColor: "text.secondary" },
  ] as const)("maps $tone to $expectedColor", ({ tone, expectedColor }) => {
    expect(resolveWorkspaceNotificationColor(tone)).toBe(expectedColor);
  });
});
