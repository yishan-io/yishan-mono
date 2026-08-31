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
  listProviders,
  validateProviderSelection,
} from "./providers";

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

describe("Yishan external provider catalog", () => {
  it("returns only active, qualified models and safe authentication setup metadata", async () => {
    const catalog = await listProviders({
      listProviders: () => [{ id: "deepseek-official" }, { id: "amazon-bedrock" }, { id: "openai-codex" }],
      listModels: async (provider) => [
        { provider, id: "selected-model", name: "Selected model" },
        { provider: "openai-codex", id: "excluded-model", name: "Excluded model" },
      ],
    });

    expect(catalog).toEqual({
      providers: [
        {
          id: "deepseek-official",
          authentication: "api-key",
          setupRequired: true,
          models: [{ provider: "deepseek-official", id: "selected-model", name: "Selected model" }],
        },
        {
          id: "amazon-bedrock",
          authentication: "ambient",
          setupRequired: false,
          models: [{ provider: "amazon-bedrock", id: "selected-model", name: "Selected model" }],
        },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain("openai-codex");
    expect(Object.keys(catalog.providers[0] ?? {})).toEqual(["id", "authentication", "setupRequired", "models"]);
    expect(JSON.stringify(catalog)).not.toContain("credential-value");
  });

  it("accepts only an exact active provider-qualified model selection", async () => {
    const llm = {
      listProviders: () => [{ id: "deepseek-official" }],
      listModels: async (provider: string) => [{ provider, id: "selected-model", name: "Selected model" }],
    };

    await expect(
      validateProviderSelection(llm, { provider: "deepseek-official", model: "selected-model" }),
    ).resolves.toBeUndefined();
    await expect(
      validateProviderSelection(llm, { provider: "openai-codex", model: "selected-model" }),
    ).rejects.toMatchObject({
      code: "YISHAN_PROVIDER_SELECTION_INVALID",
    });
    await expect(
      validateProviderSelection(llm, { provider: "deepseek-official", model: "other-model" }),
    ).rejects.toMatchObject({
      code: "YISHAN_PROVIDER_SELECTION_INVALID",
    });
  });
});

it("does not expose adapter failure details from catalog listing", async () => {
  await expect(
    listProviders({
      listProviders: () => [{ id: "deepseek-official" }],
      listModels: async () => {
        throw new Error("adapter failure");
      },
    }),
  ).rejects.toThrow("provider catalog is unavailable");
});
