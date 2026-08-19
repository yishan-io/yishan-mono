import { describe, expect, it, vi } from "vitest";
import { pickRandomProjectColor, pickRandomProjectIcon } from "./projectIconSelection";
import { PROJECT_COLOR_PRESETS, PROJECT_ICON_IDS } from "./ui/projectIconPresets";

describe("projectIconSelection random policy (desktop8 Phase 30: project concept)", () => {
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
