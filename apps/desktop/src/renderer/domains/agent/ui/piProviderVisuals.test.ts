import { describe, expect, it } from "vitest";
import { PI_PROVIDER_CATALOG } from "../providers/piProviders";
import {
  FALLBACK_PROVIDER_ICON,
  PI_PROVIDER_VISUAL_BY_ID,
  getPiProviderIcon,
  getPiProviderIconColor,
  getPiProviderVisual,
} from "./piProviderVisuals";

describe("PI_PROVIDER_VISUAL_BY_ID (desktop8 Phase 29: visual metadata moved out of Model)", () => {
  it("covers every provider in the authentication catalog", () => {
    for (const entry of PI_PROVIDER_CATALOG) {
      expect(PI_PROVIDER_VISUAL_BY_ID[entry.id], `missing visual for ${entry.id}`).toBeDefined();
    }
  });

  it("gives every catalog provider a resolvable icon", () => {
    for (const entry of PI_PROVIDER_CATALOG) {
      expect(getPiProviderIcon(entry.id)).toBeTruthy();
    }
  });

  it("provides a valid brand color for every branded mark", () => {
    const withBrand = Object.values(PI_PROVIDER_VISUAL_BY_ID).filter((visual) => visual.brandColor);
    expect(withBrand.length).toBeGreaterThan(0);
    for (const visual of withBrand) {
      expect(visual.brandColor).toMatch(/^[0-9a-fA-F]{6}$/);
    }
  });

  it("pins the asset providers to lobe Mono components", () => {
    // Providers that previously shipped SVG assets are now lobe Mono icons.
    const assetProviderIds = [
      "ant-ling",
      "cerebras",
      "fireworks",
      "groq",
      "openai",
      "openai-codex",
      "openrouter",
      "radius",
      "together",
      "xai",
      "zai",
      "zai-coding-cn",
    ];
    for (const id of assetProviderIds) {
      expect(getPiProviderIcon(id)).toBeTruthy();
    }
    // Fallback icons stay neutral (no brand color, LuCloud fallback).
    expect(getPiProviderVisual("not-a-real-provider")).toBeUndefined();
  });

  it("ships a brand-color variant for the asset providers that have one", () => {
    const withColor = new Set(["ant-ling", "cerebras", "fireworks", "openai-codex", "openrouter", "together"]);
    for (const id of [
      "ant-ling",
      "cerebras",
      "fireworks",
      "groq",
      "openai",
      "openai-codex",
      "openrouter",
      "radius",
      "together",
      "xai",
      "zai",
      "zai-coding-cn",
    ]) {
      if (withColor.has(id)) {
        expect(getPiProviderVisual(id)?.ColorIcon, id).toBeTruthy();
      } else {
        expect(getPiProviderVisual(id)?.ColorIcon, id).toBeUndefined();
      }
    }
  });

  it("resolves brand colors and switches dark brands to white in dark mode", () => {
    expect(getPiProviderIconColor("deepseek", false)).toBe("#5786FE");
    expect(getPiProviderIconColor("deepseek", true)).toBe("#5786FE");
    // Black/dark brands render white in dark mode.
    expect(getPiProviderIconColor("github-copilot", true)).toBe("#FFFFFF");
    expect(getPiProviderIconColor("github-copilot", false)).toBe("#000000");
    expect(getPiProviderIconColor("vercel-ai-gateway", true)).toBe("#FFFFFF");
    // Fallback providers inherit the text color.
    expect(getPiProviderIconColor("fireworks", false)).toBeUndefined();
    expect(getPiProviderIconColor("not-a-provider", false)).toBeUndefined();
  });

  it("falls back to the neutral cloud icon for unknown providers", () => {
    expect(getPiProviderIcon("not-a-provider")).toBe(FALLBACK_PROVIDER_ICON);
  });
});
