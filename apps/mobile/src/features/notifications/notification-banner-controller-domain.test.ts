import { describe, expect, it } from "vitest";

import { shouldScheduleNativeNotification } from "./notification-banner-controller-domain";

describe("notification-banner-controller-domain", () => {
  it("blocks scheduling when permission is not granted", () => {
    expect(
      shouldScheduleNativeNotification({
        appState: "active",
        bannerTerminalId: null,
        currentKind: "workspace",
        currentTerminalId: null,
        hasBlockingOverlay: false,
        notificationPermissionStatus: "denied",
        osNotificationsEnabled: true,
      }),
    ).toBe(false);
  });

  it("blocks scheduling when os notifications are disabled", () => {
    expect(
      shouldScheduleNativeNotification({
        appState: "background",
        bannerTerminalId: null,
        currentKind: "workspace",
        currentTerminalId: null,
        hasBlockingOverlay: false,
        notificationPermissionStatus: "granted",
        osNotificationsEnabled: false,
      }),
    ).toBe(false);
  });

  it("blocks scheduling for the currently focused terminal", () => {
    expect(
      shouldScheduleNativeNotification({
        appState: "active",
        bannerTerminalId: "terminal-1",
        currentKind: "terminal",
        currentTerminalId: "terminal-1",
        hasBlockingOverlay: false,
        notificationPermissionStatus: "granted",
        osNotificationsEnabled: true,
      }),
    ).toBe(false);
  });

  it("allows scheduling when permission, preference, and focus gates pass", () => {
    expect(
      shouldScheduleNativeNotification({
        appState: "active",
        bannerTerminalId: "terminal-2",
        currentKind: "terminal",
        currentTerminalId: "terminal-1",
        hasBlockingOverlay: false,
        notificationPermissionStatus: "granted",
        osNotificationsEnabled: true,
      }),
    ).toBe(true);
  });
});
