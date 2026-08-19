import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PROJECT_ICON_ID,
  PROJECT_COLOR_PRESETS,
  PROJECT_ICON_IDS,
  pickRandomProjectColor,
  pickRandomProjectIcon,
} from "./projectIconPresets";

describe("projectIconPresets visual presets (move to project/ui after P30)", () => {
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

describe("projectIconPresets random selection (moves to create-project after P30)", () => {
  it("picks an icon id from the available presets", () => {
    expect(PROJECT_ICON_IDS).toContain(pickRandomProjectIcon());
  });

  it("picks a color from the curated palette", () => {
    expect(PROJECT_COLOR_PRESETS).toContain(pickRandomProjectColor());
  });

  it("defaults to the first preset when Math.random returns 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickRandomProjectIcon()).toBe(PROJECT_ICON_IDS[0]);
    expect(pickRandomProjectColor()).toBe(PROJECT_COLOR_PRESETS[0]);
    vi.restoreAllMocks();
  });

  it("defaults to the last preset when Math.random is near 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(pickRandomProjectIcon()).toBe(PROJECT_ICON_IDS[PROJECT_ICON_IDS.length - 1]);
    expect(pickRandomProjectColor()).toBe(PROJECT_COLOR_PRESETS[PROJECT_COLOR_PRESETS.length - 1]);
    vi.restoreAllMocks();
  });
});
