import { describe, expect, it } from "vitest";

import {
  buildNotificationOptions,
  getNotificationSelectedValue,
  getNotificationValueLabel,
  resolveNotificationSelectionAction,
} from "./settings-notifications-domain";

const t = (key: string) => key;

describe("settings-notifications-domain", () => {
  it("builds toggle options for granted permissions", () => {
    expect(buildNotificationOptions("granted", t)).toEqual([
      { label: "settings.notificationsEnabled", value: "enabled" },
      { label: "settings.notificationsDisabled", value: "disabled" },
    ]);
  });

  it("builds permission recovery options for denied and undetermined states", () => {
    expect(buildNotificationOptions("denied", t)).toEqual([
      {
        label: "settings.notificationsPermissionOpenSettings",
        value: "open-settings",
      },
    ]);
    expect(buildNotificationOptions("undetermined", t)).toEqual([
      {
        label: "settings.notificationsPermissionEnable",
        value: "request-permission",
      },
    ]);
  });

  it("derives selected value from permission state", () => {
    expect(getNotificationSelectedValue({ enabled: true, status: "granted" })).toBe("enabled");
    expect(getNotificationSelectedValue({ enabled: false, status: "denied" })).toBe("open-settings");
    expect(getNotificationSelectedValue({ enabled: false, status: "error" })).toBe("request-permission");
  });

  it("derives status labels with loading and permission precedence", () => {
    expect(
      getNotificationValueLabel({
        enabled: true,
        isLoading: true,
        isRequesting: false,
        status: "granted",
        t,
      }),
    ).toBe("settings.notificationsPermissionChecking");
    expect(
      getNotificationValueLabel({
        enabled: true,
        isLoading: false,
        isRequesting: true,
        status: "granted",
        t,
      }),
    ).toBe("settings.notificationsPermissionRequesting");
    expect(
      getNotificationValueLabel({
        enabled: false,
        isLoading: false,
        isRequesting: false,
        status: "denied",
        t,
      }),
    ).toBe("settings.notificationsNeedPermission");
  });

  it("maps selected values into narrow actions", () => {
    expect(resolveNotificationSelectionAction({ status: "unsupported", value: "enabled" })).toEqual({
      type: "noop",
    });
    expect(resolveNotificationSelectionAction({ status: "denied", value: "open-settings" })).toEqual({
      type: "open-settings",
    });
    expect(
      resolveNotificationSelectionAction({
        status: "undetermined",
        value: "request-permission",
      }),
    ).toEqual({
      type: "request-permission",
    });
    expect(resolveNotificationSelectionAction({ status: "granted", value: "disabled" })).toEqual({
      enabled: false,
      type: "toggle",
    });
  });
});
