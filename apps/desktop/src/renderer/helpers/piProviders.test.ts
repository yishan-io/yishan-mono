import { describe, expect, it } from "vitest";
import {
  PI_PROVIDER_CATALOG,
  getPiProviderCatalogEntry,
  getPiProviderDisplayName,
  getPiProviderIcon,
  getPiProviderIconColor,
  getPiProviderPinEnv,
  isKnownPiProviderId,
  isPiProviderApiKeyCapable,
  isPiProviderOAuthCapable,
  isPiProviderSubscriptionCapable,
} from "./piProviders";

/**
 * Pinned provider-id snapshot generated from pi 0.83.0
 * (env-api-keys.js envMap + models.generated.js + docs provider table).
 * The Go daemon allowlist (apiKeyCapableProviders in
 * apps/cli/internal/daemon/pi_provider_auth.go) must equal the api_key subset
 * of this list. Bump both when pi updates.
 */
const PINNED_PROVIDER_IDS = [
  "amazon-bedrock",
  "ant-ling",
  "anthropic",
  "azure-openai-responses",
  "cerebras",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "deepseek",
  "fireworks",
  "github-copilot",
  "google",
  "google-vertex",
  "groq",
  "huggingface",
  "kimi-coding",
  "minimax",
  "minimax-cn",
  "mistral",
  "moonshotai",
  "moonshotai-cn",
  "nvidia",
  "openai",
  "openai-codex",
  "opencode",
  "opencode-go",
  "openrouter",
  "qwen-token-plan",
  "qwen-token-plan-cn",
  "radius",
  "together",
  "vercel-ai-gateway",
  "xai",
  "xiaomi",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "zai",
  "zai-coding-cn",
];

describe("PI_PROVIDER_CATALOG", () => {
  it("matches the pinned pi 0.83.0 provider id snapshot", () => {
    // Compare as sorted sets: the snapshot guards against provider drift, not
    // catalog ordering.
    const catalogIds = PI_PROVIDER_CATALOG.map((entry) => entry.id).sort();
    const pinnedIds = [...PINNED_PROVIDER_IDS].sort();
    expect(catalogIds).toEqual(pinnedIds);
  });

  it("sorts the catalog alphabetically by display name", () => {
    const names = PI_PROVIDER_CATALOG.map((entry) => entry.name.toLowerCase());
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
    const openaiIndex = PI_PROVIDER_CATALOG.findIndex((entry) => entry.id === "openai");
    const codexIndex = PI_PROVIDER_CATALOG.findIndex((entry) => entry.id === "openai-codex");
    expect(codexIndex - openaiIndex).toBe(1);
  });

  it("has unique, well-formed ids and non-empty names", () => {
    const ids = new Set<string>();
    for (const entry of PI_PROVIDER_CATALOG) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
    }
  });

  it("marks exactly one subscription-only provider as oauth and five as both", () => {
    const oauthOnly = PI_PROVIDER_CATALOG.filter((entry) => entry.authMode === "oauth").map((entry) => entry.id);
    expect(oauthOnly).toEqual(["openai-codex"]);

    const both = PI_PROVIDER_CATALOG.filter((entry) => entry.authMode === "both").map((entry) => entry.id);
    expect(both).toEqual(["anthropic", "github-copilot", "openrouter", "radius", "xai"]);

    const apiKey = PI_PROVIDER_CATALOG.filter((entry) => entry.authMode === "api_key");
    expect(apiKey).toHaveLength(PINNED_PROVIDER_IDS.length - oauthOnly.length - both.length);
  });

  it("gives every entry a resolvable icon", () => {
    for (const entry of PI_PROVIDER_CATALOG) {
      expect(typeof entry.icon).toBe("function");
    }
  });

  it("provides a valid brand color for every react-icon mark", () => {
    const withReactIcon = PI_PROVIDER_CATALOG.filter(
      (entry) => !entry.assetIcon && entry.icon !== getPiProviderIcon("not-a-provider"),
    );
    expect(withReactIcon.length).toBeGreaterThan(0);
    for (const entry of withReactIcon) {
      expect(entry.brandColor).toMatch(/^[0-9a-fA-F]{6}$/);
    }
  });

  it("pins the official SVG asset icons and their dark-mode handling", () => {
    const withAsset = PI_PROVIDER_CATALOG.filter((entry) => entry.assetIcon).map((entry) => entry.id);
    expect(withAsset).toEqual([
      "ant-ling",
      "cerebras",
      "fireworks",
      "groq",
      "openai",
      "openai-codex",
      "radius",
      "together",
      "xai",
      "zai-coding-cn",
      "zai",
    ]);
    for (const entry of PI_PROVIDER_CATALOG.filter((candidate) => candidate.assetIcon)) {
      expect(entry.assetIcon).toMatch(/^app-icons\//);
    }
    // Monochrome assets need a white filter in dark mode; colored ones do not.
    const monochromeAssetIds = PI_PROVIDER_CATALOG.filter((entry) => entry.assetIcon && entry.monochrome).map(
      (entry) => entry.id,
    );
    expect(monochromeAssetIds).toEqual(["ant-ling", "groq", "openai", "openai-codex", "radius", "xai"]);
    // The codex mark does not fill its viewBox; it needs a visual scale-up.
    expect(getPiProviderCatalogEntry("openai-codex")?.iconScale).toBe(1.5);
    // Fallback icons stay neutral (no brand color, no asset).
    expect(getPiProviderCatalogEntry("not-a-real-provider")?.brandColor).toBeUndefined();
    expect(getPiProviderCatalogEntry("not-a-real-provider")?.assetIcon).toBeUndefined();
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

  it("resolves known ids and falls back for unknown ids", () => {
    expect(getPiProviderCatalogEntry("deepseek")?.name).toBe("DeepSeek");
    expect(isKnownPiProviderId("deepseek")).toBe(true);
    expect(getPiProviderDisplayName("not-a-provider")).toBe("not-a-provider");
    expect(getPiProviderIcon("not-a-provider")).toBe(getPiProviderIcon("openai"));
    expect(isKnownPiProviderId("not-a-provider")).toBe(false);
  });

  it("treats oauth-only providers as not api-key capable, but both-mode as capable", () => {
    expect(isPiProviderApiKeyCapable("deepseek")).toBe(true);
    expect(isPiProviderApiKeyCapable("anthropic")).toBe(true);
    expect(isPiProviderApiKeyCapable("openrouter")).toBe(true);
    expect(isPiProviderApiKeyCapable("github-copilot")).toBe(true);
    expect(isPiProviderApiKeyCapable("openai-codex")).toBe(false);
    expect(isPiProviderApiKeyCapable("not-a-provider")).toBe(false);
  });

  it("derives pin env values from ambient AWS profile sources", () => {
    expect(getPiProviderPinEnv("amazon-bedrock", "AWS_PROFILE: ai-bedrock")).toEqual({ AWS_PROFILE: "ai-bedrock" });
    expect(getPiProviderPinEnv("amazon-bedrock", "AWS profile: ai-bedrock, default")).toEqual({
      AWS_PROFILE: "ai-bedrock",
    });
    // Non-profile sources and providers without env vars cannot be pinned.
    expect(getPiProviderPinEnv("amazon-bedrock", "AWS access keys")).toBeNull();
    expect(getPiProviderPinEnv("google-vertex", "gcloud application default credentials")).toBeNull();
    expect(getPiProviderPinEnv("deepseek", "AWS_PROFILE: ai-bedrock")).toBeNull();
    expect(getPiProviderPinEnv("amazon-bedrock", undefined)).toBeNull();
  });

  it("marks subscription-capable providers (paid plans) and excludes OAuth-only gateways", () => {
    expect(isPiProviderSubscriptionCapable("anthropic")).toBe(true);
    expect(isPiProviderSubscriptionCapable("xai")).toBe(true);
    expect(isPiProviderSubscriptionCapable("openai-codex")).toBe(true);
    expect(isPiProviderSubscriptionCapable("github-copilot")).toBe(true);
    // OAuth sign-in exists but is NOT a paid subscription (mints a key / gateway token).
    expect(isPiProviderSubscriptionCapable("openrouter")).toBe(false);
    expect(isPiProviderSubscriptionCapable("radius")).toBe(false);
    expect(isPiProviderSubscriptionCapable("deepseek")).toBe(false);
    expect(isPiProviderSubscriptionCapable("not-a-provider")).toBe(false);
  });

  it("distinguishes account sign-in (OAuth) from subscriptions", () => {
    expect(isPiProviderOAuthCapable("anthropic")).toBe(true);
    expect(isPiProviderOAuthCapable("openrouter")).toBe(true);
    expect(isPiProviderOAuthCapable("radius")).toBe(true);
    expect(isPiProviderOAuthCapable("openai-codex")).toBe(true);
    expect(isPiProviderOAuthCapable("deepseek")).toBe(false);
    expect(isPiProviderOAuthCapable("not-a-provider")).toBe(false);
  });
});
