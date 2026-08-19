import { describe, expect, it } from "vitest";
import { PI_PROVIDER_CATALOG } from "../model/piProviders";
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
      expect(typeof getPiProviderIcon(entry.id)).toBe("function");
    }
  });

  it("provides a valid brand color for every react-icon mark", () => {
    const withReactIcon = Object.values(PI_PROVIDER_VISUAL_BY_ID).filter(
      (visual) => !visual.assetIcon && visual.icon !== FALLBACK_PROVIDER_ICON,
    );
    expect(withReactIcon.length).toBeGreaterThan(0);
    for (const visual of withReactIcon) {
      expect(visual.brandColor).toMatch(/^[0-9a-fA-F]{6}$/);
    }
  });

  it("pins the official SVG asset icons and their dark-mode handling", () => {
    const withAsset = Object.entries(PI_PROVIDER_VISUAL_BY_ID)
      .filter(([, visual]) => visual.assetIcon)
      .map(([id]) => id)
      .sort();
    expect(withAsset).toEqual([
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
    ]);
    for (const visual of Object.values(PI_PROVIDER_VISUAL_BY_ID).filter((candidate) => candidate.assetIcon)) {
      expect(visual.assetIcon).toMatch(/^app-icons\//);
    }
    // Monochrome assets need a white filter in dark mode; colored ones do not.
    const monochromeAssetIds = Object.entries(PI_PROVIDER_VISUAL_BY_ID)
      .filter(([, visual]) => visual.assetIcon && visual.monochrome)
      .map(([id]) => id)
      .sort();
    expect(monochromeAssetIds).toEqual(["ant-ling", "groq", "openai", "openai-codex", "radius", "xai"]);
    // The codex mark does not fill its viewBox; it needs a visual scale-up.
    expect(getPiProviderVisual("openai-codex")?.iconScale).toBe(1.5);
    // Fallback icons stay neutral (no brand color, no asset).
    expect(getPiProviderVisual("not-a-real-provider")).toBeUndefined();
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
