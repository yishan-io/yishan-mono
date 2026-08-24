import { describe, expect, it } from "vitest";
import { getHexFromHsv, getHsvFromHex, isValidHexColor } from "./localTaskTagColorHsv";

describe("localTaskTagColorHsv", () => {
  it("converts HSV primary colors to normalized #RRGGBB hex values", () => {
    expect(getHexFromHsv({ hue: 0, saturation: 100, value: 100 })).toBe("#FF0000");
    expect(getHexFromHsv({ hue: 120, saturation: 100, value: 100 })).toBe("#00FF00");
    expect(getHexFromHsv({ hue: 240, saturation: 100, value: 100 })).toBe("#0000FF");
  });

  it("parses valid hex values and rejects malformed values", () => {
    expect(getHsvFromHex("#1a2B3c")).toEqual({ hue: 210, saturation: 57, value: 24 });
    expect(getHsvFromHex("#123")).toBeNull();
    expect(isValidHexColor("#1A2B3C")).toBe(true);
    expect(isValidHexColor("1A2B3C")).toBe(false);
  });
});
