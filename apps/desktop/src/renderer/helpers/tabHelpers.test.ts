import { describe, expect, it } from "vitest";
import { resolveAvailableModelsFromCapabilities, resolveCurrentModelFromCapabilities } from "./tabHelpers";

describe("tabHelpers capability parsing", () => {
  it("extracts available and current model ids from capabilities payload", () => {
    const capabilities = {
      models: {
        availableModels: [
          { id: "azure/gpt-5.3-codex", name: "GPT-5.3 Codex" },
          { modelId: "openai/o3" },
          { model: "anthropic/claude-4" },
          { name: "missing-id" },
        ],
        current: "openai/o3",
      },
    };

    expect(resolveAvailableModelsFromCapabilities(capabilities)).toEqual([
      { id: "azure/gpt-5.3-codex", name: "GPT-5.3 Codex" },
      { id: "openai/o3", name: "openai/o3" },
      { id: "anthropic/claude-4", name: "anthropic/claude-4" },
    ]);
    expect(resolveCurrentModelFromCapabilities(capabilities)).toBe("openai/o3");
  });
});
