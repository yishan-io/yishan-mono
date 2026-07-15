import { describe, expect, it } from "vitest";
import {
  formatAiChatModelSelection,
  isAiChatModelSelectionAvailable,
  parseAiChatModelSelection,
} from "./aiChatSettings";

describe("AI Chat model selection", () => {
  it("parses a strict provider/model pattern", () => {
    expect(parseAiChatModelSelection("  openai/gpt-5  ")).toEqual({
      providerId: "openai",
      modelId: "gpt-5",
    });
    expect(parseAiChatModelSelection("openai/deployment/version")).toEqual({
      providerId: "openai",
      modelId: "deployment/version",
    });
  });

  it.each([undefined, "", "openai", "openai/", "/gpt-5", "a".repeat(513)])(
    "rejects malformed model pattern %j",
    (pattern) => {
      expect(parseAiChatModelSelection(pattern)).toBeUndefined();
    },
  );

  it("formats only valid structured selections", () => {
    expect(formatAiChatModelSelection({ providerId: "openai", modelId: "gpt-5" })).toBe("openai/gpt-5");
    expect(formatAiChatModelSelection({ providerId: "", modelId: "gpt-5" })).toBeUndefined();
  });

  it("accepts only selections backed by an available runtime model", () => {
    const models = [
      {
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-5",
        label: "GPT-5",
        available: true,
      },
      {
        providerId: "anthropic",
        providerName: "Anthropic",
        modelId: "claude-4",
        label: "Claude 4",
        available: false,
      },
    ];

    expect(isAiChatModelSelectionAvailable(models, { providerId: "openai", modelId: "gpt-5" })).toBe(true);
    expect(isAiChatModelSelectionAvailable(models, { providerId: "anthropic", modelId: "claude-4" })).toBe(false);
  });
});
