import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ICON_ID, PROJECT_COLOR_PRESETS, PROJECT_ICON_IDS } from "./projectIconPresets";

describe("projectIconPresets visual presets (desktop8 Phase 30: project/ui)", () => {
  it("keeps a stable display-ordered icon id list", () => {
    expect(PROJECT_ICON_IDS).toContain("folder");
    expect(PROJECT_ICON_IDS).toContain("code");
    expect(PROJECT_ICON_IDS[0]).toBe("folder");
    expect(new Set(PROJECT_ICON_IDS).size).toBe(PROJECT_ICON_IDS.length);
  });

  it("pins the default icon id", () => {
    expect(DEFAULT_PROJECT_ICON_ID).toBe("folder");
    expect(PROJECT_ICON_IDS).toContain(DEFAULT_PROJECT_ICON_ID);
  });

  it("keeps a curated color palette", () => {
    expect(PROJECT_COLOR_PRESETS.length).toBeGreaterThan(0);
    for (const color of PROJECT_COLOR_PRESETS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
