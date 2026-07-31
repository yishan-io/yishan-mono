import { describe, expect, it } from "vitest";
import {
  EXTERNAL_APP_MENU_ENTRIES,
  JETBRAINS_EXTERNAL_APP_IDS,
  findExternalAppPreset,
  getExternalAppDetectionKeys,
  getExternalAppMenuEntries,
  isExternalAppPlatformSupported,
  isExternalAppPresetSupportedOnPlatform,
  normalizeExternalAppPlatform,
} from "./externalApps";

describe("normalizeExternalAppPlatform", () => {
  it("normalizes common macOS, Linux, and Windows platform values", () => {
    expect(normalizeExternalAppPlatform("darwin")).toBe("darwin");
    expect(normalizeExternalAppPlatform("MacIntel")).toBe("darwin");
    expect(normalizeExternalAppPlatform("linux")).toBe("linux");
    expect(normalizeExternalAppPlatform("Linux x86_64")).toBe("linux");
    expect(normalizeExternalAppPlatform("win32")).toBe("win32");
    expect(normalizeExternalAppPlatform("Win32")).toBe("win32");
  });
});

describe("isExternalAppPlatformSupported", () => {
  it("supports macOS and Linux platform values and rejects unsupported platforms", () => {
    expect(isExternalAppPlatformSupported("darwin")).toBe(true);
    expect(isExternalAppPlatformSupported("MacIntel")).toBe(true);
    expect(isExternalAppPlatformSupported("Linux x86_64")).toBe(true);
    expect(isExternalAppPlatformSupported("win32")).toBe(false);
    expect(isExternalAppPlatformSupported("freebsd")).toBe(false);
  });
});

describe("workspace external app menu entries", () => {
  it("exposes JetBrains apps as a third-level group menu", () => {
    const jetBrainsGroupEntry = EXTERNAL_APP_MENU_ENTRIES.find((entry) => entry.kind === "group");
    expect(jetBrainsGroupEntry?.kind).toBe("group");
    expect(jetBrainsGroupEntry?.id).toBe("jetbrains");
    expect(jetBrainsGroupEntry?.appIds).toEqual(JETBRAINS_EXTERNAL_APP_IDS);
  });
});

describe("isExternalAppPresetSupportedOnPlatform", () => {
  it("does not expose Xcode on Linux", () => {
    expect(isExternalAppPresetSupportedOnPlatform("xcode", "linux")).toBe(false);
    expect(isExternalAppPresetSupportedOnPlatform("xcode", "darwin")).toBe(true);
  });
});

describe("getExternalAppDetectionKeys", () => {
  it("treats shared Linux launcher commands as inconclusive", () => {
    expect(getExternalAppDetectionKeys("jetbrains-intellij-idea", "linux")).toEqual([]);
    expect(getExternalAppDetectionKeys("jetbrains-pycharm", "linux")).toEqual([]);
    expect(getExternalAppDetectionKeys("jetbrains-webstorm", "linux")).toEqual(["webstorm"]);
  });
});

describe("getExternalAppMenuEntries", () => {
  it("flattens detected JetBrains apps into top-level entries when filtering by allowed app ids", () => {
    expect(getExternalAppMenuEntries("darwin", ["cursor", "jetbrains-webstorm"])).toEqual([
      { kind: "app", appId: "cursor" },
      { kind: "app", appId: "jetbrains-webstorm" },
    ]);
  });

  it("keeps Linux inconclusive apps visible alongside detected apps", () => {
    expect(getExternalAppMenuEntries("linux", ["cursor"])).toEqual([
      { kind: "app", appId: "cursor" },
      { kind: "app", appId: "jetbrains-intellij-idea" },
      { kind: "app", appId: "jetbrains-intellij-idea-ce" },
      { kind: "app", appId: "jetbrains-pycharm" },
      { kind: "app", appId: "jetbrains-pycharm-ce" },
    ]);
  });

  it("returns no reliable macOS app entries when detection succeeds with no matches", () => {
    expect(getExternalAppMenuEntries("darwin", [])).toEqual([]);
  });

  it("falls back to the platform-scoped full menu when detection is unavailable", () => {
    expect(getExternalAppMenuEntries("darwin", null)).toEqual(EXTERNAL_APP_MENU_ENTRIES);
  });
});

describe("findExternalAppPreset", () => {
  it("resolves one JetBrains IDE preset by id", () => {
    expect(findExternalAppPreset("jetbrains-webstorm")?.label).toBe("WebStorm");
  });

  it("maps JetBrains IDE presets to product-specific app icons", () => {
    expect(findExternalAppPreset("jetbrains-intellij-idea")?.iconSrc).toBe("app-icons/intellij.svg");
    expect(findExternalAppPreset("jetbrains-webstorm")?.iconSrc).toBe("app-icons/webstorm.svg");
    expect(findExternalAppPreset("jetbrains-pycharm")?.iconSrc).toBe("app-icons/pycharm.svg");
    expect(findExternalAppPreset("jetbrains-goland")?.iconSrc).toBe("app-icons/goland.svg");
    expect(findExternalAppPreset("jetbrains-clion")?.iconSrc).toBe("app-icons/clion.svg");
    expect(findExternalAppPreset("jetbrains-rider")?.iconSrc).toBe("app-icons/rider.svg");
    expect(findExternalAppPreset("jetbrains-phpstorm")?.iconSrc).toBe("app-icons/phpstorm.svg");
    expect(findExternalAppPreset("jetbrains-rustrover")?.iconSrc).toBe("app-icons/rustrover.svg");
    expect(findExternalAppPreset("jetbrains-datagrip")?.iconSrc).toBe("app-icons/datagrip.svg");
    expect(findExternalAppPreset("jetbrains-android-studio")?.iconSrc).toBe("app-icons/android-studio.svg");
  });
});
