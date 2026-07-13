import { describe, expect, it } from "vitest";
import en from "../../locales/en/common.json";
import zh from "../../locales/zh/common.json";

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectStrings);
}

describe("agent provider copy", () => {
  it("uses the AI Chat product name", () => {
    expect(en.settings.agentProviders.title).toBe("Ai Chat Providers & Models");
    expect(zh.settings.agentProviders.title).toBe("AI Chat 提供商与模型");
  });

  it.each([
    ["English", en.settings.agentProviders],
    ["Chinese", zh.settings.agentProviders],
  ])("does not expose Pi implementation terminology in %s", (_locale, copy) => {
    expect(collectStrings(copy).filter((value) => /\bPi\b/.test(value))).toEqual([]);
  });
});
