import { describe, expect, it } from "vitest";
import { formatTokens } from "./formatters";

describe("formatTokens", () => {
  it("formats null as zero", () => {
    expect(formatTokens(null)).toBe("0");
  });

  it("formats thousands with K", () => {
    expect(formatTokens(1_500)).toBe("1.5K");
  });

  it("formats millions with M", () => {
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });

  it("formats billions with B", () => {
    expect(formatTokens(3_750_000_000)).toBe("3.8B");
  });
});
