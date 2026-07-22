import { describe, expect, it } from "vitest";
import { formatAiChatModelSelection, isAiChatModelSelectionAvailable } from "./aiChatSettings";

describe("AI Chat model selection", () => {
  it("formats only valid structured selections", () => {
    expect(formatAiChatModelSelection({ providerId: "openai", modelId: "gpt-5" })).toBe("openai/gpt-5");
    expect(formatAiChatModelSelection({ providerId: "", modelId: "gpt-5" })).toBeUndefined();
  });

  it("accepts only selections present in the available model projection", () => {
    const models = [
      {
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-5",
        label: "GPT-5",
      },
    ];

    expect(isAiChatModelSelectionAvailable(models, { providerId: "openai", modelId: "gpt-5" })).toBe(true);
    expect(isAiChatModelSelectionAvailable(models, { providerId: "anthropic", modelId: "claude-4" })).toBe(false);
  });
});
