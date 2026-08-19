import { describe, expect, it } from "vitest";
import { splitModelId, stripProviderPrefix } from "./modelPicker";

describe("splitModelId", () => {
  it("splits a provider-prefixed id into provider and model key", () => {
    expect(splitModelId("anthropic/claude-sonnet-4-5")).toEqual({
      provider: "anthropic",
      modelKey: "claude-sonnet-4-5",
    });
  });

  it("keeps slashed model keys intact for openrouter-style ids", () => {
    expect(splitModelId("openrouter/anthropic/claude-sonnet-4-5")).toEqual({
      provider: "openrouter",
      modelKey: "anthropic/claude-sonnet-4-5",
    });
  });

  it("returns an empty provider for a slash-less id", () => {
    expect(splitModelId("gpt-5.6-terra")).toEqual({ provider: "", modelKey: "gpt-5.6-terra" });
  });

  it("trims surrounding whitespace and lowercases the provider", () => {
    expect(splitModelId("  ANTHROPIC/claude-sonnet-4-5  ")).toEqual({
      provider: "anthropic",
      modelKey: "claude-sonnet-4-5",
    });
  });

  it("treats a leading slash as an empty provider", () => {
    expect(splitModelId("/claude-sonnet-4-5")).toEqual({ provider: "", modelKey: "claude-sonnet-4-5" });
  });

  it("keeps an empty model key for a trailing slash", () => {
    expect(splitModelId("anthropic/")).toEqual({ provider: "anthropic", modelKey: "" });
  });
});

describe("stripProviderPrefix", () => {
  it("strips the provider id prefix from the display name", () => {
    expect(stripProviderPrefix("anthropic/claude-sonnet-4-5", "anthropic", "Anthropic")).toBe("claude-sonnet-4-5");
  });

  it("strips the display-name prefix case-insensitively", () => {
    expect(stripProviderPrefix("Anthropic/claude-sonnet-4-5", "anthropic", "Anthropic")).toBe("claude-sonnet-4-5");
  });

  it("strips only the provider segment of an openrouter-style name", () => {
    expect(stripProviderPrefix("openrouter/anthropic/claude-opus-4.5", "openrouter", "OpenRouter")).toBe(
      "anthropic/claude-opus-4.5",
    );
  });

  it("leaves human-readable names without a provider prefix unchanged", () => {
    expect(stripProviderPrefix("Claude Sonnet 4.5", "anthropic", "Anthropic")).toBe("Claude Sonnet 4.5");
  });
});
