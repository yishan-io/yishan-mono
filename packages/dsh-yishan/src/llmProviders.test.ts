import { getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import { describe, expect, it } from "vitest";

import {
  DIRECT_DEEPSEEK_PROVIDER,
  PI_AI_DEEPSEEK_PROVIDER,
  YISHAN_AMBIENT_PI_AI_PROVIDER_IDS,
  YISHAN_DSH_ACTIVE_PROVIDER_COUNT,
  YISHAN_DSH_ACTIVE_PROVIDER_IDS,
  YISHAN_DSH_ACTIVE_PROVIDER_SET,
  YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT,
  YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST,
  YISHAN_PI_AI_CATALOG,
  YISHAN_PI_AI_CONFIG,
  YISHAN_PI_AI_PROVIDER_ALLOWLIST,
  YISHAN_UNSUPPORTED_PI_AI_PROVIDERS,
  assertPiAiProviderManifest,
} from "./llmProviders";

describe("Yishan pi-ai provider manifest", () => {
  it("defines exactly 36 pi-ai routes plus the separate direct DeepSeek route for 37 active DSH routes", () => {
    assertPiAiProviderManifest();

    expect(YISHAN_PI_AI_CATALOG).toHaveLength(YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT);
    expect(YISHAN_PI_AI_PROVIDER_ALLOWLIST).toHaveLength(YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT);
    expect(YISHAN_DSH_ACTIVE_PROVIDER_IDS).toEqual([
      DIRECT_DEEPSEEK_PROVIDER,
      ...YISHAN_PI_AI_CATALOG.map(({ provider }) => provider),
    ]);
    expect(YISHAN_DSH_ACTIVE_PROVIDER_IDS).toHaveLength(YISHAN_DSH_ACTIVE_PROVIDER_COUNT);
    expect(YISHAN_DSH_ACTIVE_PROVIDER_SET).toHaveLength(YISHAN_DSH_ACTIVE_PROVIDER_COUNT);
    expect(YISHAN_PI_AI_CATALOG.map(({ provider }) => provider)).toEqual([...YISHAN_PI_AI_PROVIDER_ALLOWLIST]);
    expect(YISHAN_PI_AI_CATALOG.map(({ provider }) => provider)).toContain(PI_AI_DEEPSEEK_PROVIDER);
    expect(YISHAN_PI_AI_CATALOG.map(({ provider }) => provider)).not.toContain(DIRECT_DEEPSEEK_PROVIDER);
    expect(YISHAN_PI_AI_CONFIG.providers).toHaveProperty(PI_AI_DEEPSEEK_PROVIDER, {
      apiKeyEnv: "DEEPSEEK_API_KEY",
    });
  });

  it("keeps OAuth and dynamic routes out of all active pi-ai and final DSH route sets", () => {
    const activeProviderIds = YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST.map(({ provider }) => provider);

    expect(YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST).toHaveLength(YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT);
    expect(YISHAN_PI_AI_CATALOG).toBe(YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST);
    for (const provider of YISHAN_UNSUPPORTED_PI_AI_PROVIDERS) {
      expect(activeProviderIds).not.toContain(provider);
      expect(YISHAN_PI_AI_PROVIDER_ALLOWLIST).not.toContain(provider);
      expect(YISHAN_DSH_ACTIVE_PROVIDER_IDS).not.toContain(provider);
      expect(YISHAN_DSH_ACTIVE_PROVIDER_SET).not.toContain(provider);
      expect(YISHAN_PI_AI_CONFIG.providers).not.toHaveProperty(provider);
    }
  });

  it("detects installed pi-ai catalog drift while keeping OAuth and dynamic routes inactive", () => {
    const installedProviderIds = getBuiltinProviders();

    expect(new Set(installedProviderIds)).toEqual(
      new Set([...YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST.map(({ provider }) => provider), "openai-codex"]),
    );
  });

  it("permits fallback behavior only for the four ambient-classified routes", () => {
    const ambientProviderIds = YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST.flatMap((entry) =>
      entry.authentication === "ambient" ? [entry.provider] : [],
    );

    expect(new Set(ambientProviderIds)).toEqual(new Set(YISHAN_AMBIENT_PI_AI_PROVIDER_IDS));
    expect(ambientProviderIds).toHaveLength(YISHAN_AMBIENT_PI_AI_PROVIDER_IDS.length);
    for (const entry of YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST) {
      const profile = YISHAN_PI_AI_CONFIG.providers?.[entry.provider];
      if (entry.authentication === "api-key") {
        expect(entry.apiKeyEnv).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(profile).toEqual({ apiKeyEnv: entry.apiKeyEnv });
      } else {
        expect(profile).toEqual({});
      }
    }
  });
});
