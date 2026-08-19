import { describe, expect, it } from "vitest";
import {
  THINKING_LEVELS,
  clampThinkingLevel,
  formatSupportedThinkingLevels,
  getSupportedThinkingLevels,
  isThinkingLevelSupported,
} from "./agentThinkingLevels";

// Real catalog shapes (models-store.json) pin the mirror of pi-ai semantics.
const DEEPSEEK_V4_FLASH = {
  reasoning: true,
  thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
};
const FULL_RANGE = {
  reasoning: true,
  thinkingLevelMap: {
    off: "off",
    minimal: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  },
};
const NON_REASONING = { reasoning: false, thinkingLevelMap: {} };

describe("getSupportedThinkingLevels", () => {
  it("returns only off for non-reasoning models", () => {
    expect(getSupportedThinkingLevels(NON_REASONING)).toEqual(["off"]);
  });

  it("excludes explicitly-null levels and requires explicit entries for xhigh/max", () => {
    expect(getSupportedThinkingLevels(DEEPSEEK_V4_FLASH)).toEqual(["off", "high", "max"]);
  });

  it("returns the full list for a model with a complete map", () => {
    expect(getSupportedThinkingLevels(FULL_RANGE)).toEqual([...THINKING_LEVELS]);
  });

  it("treats missing capability data as supporting the full list", () => {
    expect(getSupportedThinkingLevels(undefined)).toEqual([...THINKING_LEVELS]);
    expect(getSupportedThinkingLevels(null)).toEqual([...THINKING_LEVELS]);
    expect(getSupportedThinkingLevels({ reasoning: true })).toEqual([...THINKING_LEVELS]);
    expect(getSupportedThinkingLevels({ reasoning: undefined, thinkingLevelMap: undefined })).toEqual([
      ...THINKING_LEVELS,
    ]);
  });
});

describe("isThinkingLevelSupported", () => {
  it("reports unsupported levels from the map", () => {
    expect(isThinkingLevelSupported("medium", DEEPSEEK_V4_FLASH)).toBe(false);
    expect(isThinkingLevelSupported("xhigh", DEEPSEEK_V4_FLASH)).toBe(false);
    expect(isThinkingLevelSupported("high", DEEPSEEK_V4_FLASH)).toBe(true);
  });

  it("treats unknown data as supported", () => {
    expect(isThinkingLevelSupported("medium", undefined)).toBe(true);
  });
});

describe("clampThinkingLevel", () => {
  it("walks up first to the nearest supported level", () => {
    expect(clampThinkingLevel("medium", DEEPSEEK_V4_FLASH)).toBe("high");
    expect(clampThinkingLevel("low", DEEPSEEK_V4_FLASH)).toBe("high");
    expect(clampThinkingLevel("xhigh", DEEPSEEK_V4_FLASH)).toBe("max");
  });

  it("keeps supported levels unchanged", () => {
    expect(clampThinkingLevel("off", DEEPSEEK_V4_FLASH)).toBe("off");
    expect(clampThinkingLevel("high", DEEPSEEK_V4_FLASH)).toBe("high");
    expect(clampThinkingLevel("medium", FULL_RANGE)).toBe("medium");
  });

  it("clamps non-reasoning models to off", () => {
    expect(clampThinkingLevel("medium", NON_REASONING)).toBe("off");
  });

  it("falls back to off for unknown levels or models", () => {
    expect(clampThinkingLevel("bogus", DEEPSEEK_V4_FLASH)).toBe("off");
    expect(clampThinkingLevel("medium", undefined)).toBe("medium");
  });
});

describe("formatSupportedThinkingLevels", () => {
  it("renders a compact list", () => {
    expect(formatSupportedThinkingLevels(DEEPSEEK_V4_FLASH)).toBe("off, high, max");
    expect(formatSupportedThinkingLevels(NON_REASONING)).toBe("off");
  });
});
