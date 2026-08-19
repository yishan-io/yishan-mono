import { describe, expect, it } from "vitest";
import { formatDetailedTokenCount } from "./agentChatUsageFormatting";

describe("formatDetailedTokenCount (desktop8 Phase 29: formatting moved to Agent Chat feature)", () => {
  it("formats small counts with locale grouping", () => {
    expect(formatDetailedTokenCount(0)).toBe("0");
    expect(formatDetailedTokenCount(1234)).toBe("1.2K");
  });

  it("uses compact k/m units for large counts", () => {
    expect(formatDetailedTokenCount(2_206)).toBe("2.2K");
    expect(formatDetailedTokenCount(128_000)).toBe("128K");
    expect(formatDetailedTokenCount(1_500_000)).toBe("1.5M");
  });

  it("clamps negative counts to zero", () => {
    expect(formatDetailedTokenCount(-5)).toBe("0");
  });
});
