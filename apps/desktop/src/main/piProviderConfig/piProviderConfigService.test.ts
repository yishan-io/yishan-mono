import type { AuthLoginCallbacks } from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  PiProviderConfigService,
  buildPiProviderConfigSnapshot,
  inferPiProviderAuthSource,
} from "./piProviderConfigService";

function findProvider(snapshot: ReturnType<typeof buildPiProviderConfigSnapshot>, providerId: string) {
  const provider = snapshot.providers.find((entry) => entry.id === providerId);
  expect(provider).toBeDefined();
  if (!provider) {
    throw new Error(`Missing provider: ${providerId}`);
  }
  return provider;
}

describe("PiProviderConfigService", () => {
  it("loads the ESM runtime lazily when the first snapshot is requested", async () => {
    const sdkModuleLoader = vi.fn(async () => ({
      AuthStorage,
      ModelRegistry,
      VERSION: "0.80.6",
      getAgentDir: () => "/tmp/pi-runtime-test",
    }));
    const service = new PiProviderConfigService({
      agentDir: "/tmp/pi-runtime-test",
      sdkModuleLoader,
    });

    expect(sdkModuleLoader).not.toHaveBeenCalled();

    await service.getSnapshot();

    expect(sdkModuleLoader).toHaveBeenCalledOnce();
  });

  it("returns the cached snapshot without reloading Pi configuration", async () => {
    const authStorage = AuthStorage.inMemory({ openai: { type: "api_key", key: "sk-openai" } });
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    const reload = vi.spyOn(authStorage, "reload");
    const refresh = vi.spyOn(modelRegistry, "refresh");
    const service = new PiProviderConfigService({ authStorage, modelRegistry });

    const firstSnapshot = await service.getSnapshot();
    const secondSnapshot = await service.getSnapshot();

    expect(secondSnapshot).toBe(firstSnapshot);
    expect(reload).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reloads Pi configuration when an explicit refresh is requested", async () => {
    const authStorage = AuthStorage.inMemory({ openai: { type: "api_key", key: "sk-openai" } });
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    const reload = vi.spyOn(authStorage, "reload");
    const refresh = vi.spyOn(modelRegistry, "refresh");
    const service = new PiProviderConfigService({ authStorage, modelRegistry });

    const initialSnapshot = await service.getSnapshot();
    const refreshedSnapshot = await service.refreshSnapshot();

    expect(refreshedSnapshot).not.toBe(initialSnapshot);
    expect(reload).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("retries runtime initialization after a transient loader failure", async () => {
    const sdkModuleLoader = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary loader failure"))
      .mockResolvedValue({
        AuthStorage,
        ModelRegistry,
        getAgentDir: () => "/tmp/pi-runtime-test",
      });
    const service = new PiProviderConfigService({
      agentDir: "/tmp/pi-runtime-test",
      sdkModuleLoader,
    });

    await expect(service.getSnapshot()).rejects.toThrow("temporary loader failure");
    await expect(service.getSnapshot()).resolves.toMatchObject({
      providers: expect.any(Array),
      models: expect.any(Array),
    });

    expect(sdkModuleLoader).toHaveBeenCalledTimes(2);
  });

  it("persists complete provider-scoped API-key credentials", async () => {
    const authStorage = AuthStorage.inMemory();
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    const prompt = vi
      .fn<AuthLoginCallbacks["prompt"]>()
      .mockResolvedValueOnce("cf-key")
      .mockResolvedValueOnce("account-id")
      .mockResolvedValueOnce("gateway-id");
    const service = new PiProviderConfigService({
      agentDir: "/tmp/pi-runtime-test",
      authStorage,
      modelRegistry,
    });

    await service.authenticate("cloudflare-ai-gateway", "api_key", { prompt, notify: vi.fn() });

    expect(authStorage.get("cloudflare-ai-gateway")).toEqual({
      type: "api_key",
      key: "cf-key",
      env: {
        CLOUDFLARE_ACCOUNT_ID: "account-id",
        CLOUDFLARE_GATEWAY_ID: "gateway-id",
      },
    });
  });

  it("does not turn a successful credential write into an authentication failure when snapshot refresh is unavailable", async () => {
    const authStorage = AuthStorage.inMemory();
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    vi.spyOn(modelRegistry, "refresh").mockImplementation(() => {
      throw new Error("refresh unavailable");
    });
    const service = new PiProviderConfigService({ authStorage, modelRegistry });

    await expect(
      service.authenticate("openai", "api_key", {
        prompt: vi.fn(async () => "sk-openai"),
        notify: vi.fn(),
      }),
    ).resolves.toBeUndefined();

    expect(authStorage.get("openai")).toMatchObject({ type: "api_key", key: "sk-openai" });
  });

  it("rejects empty API-key credentials without writing them", async () => {
    const authStorage = AuthStorage.inMemory();
    const service = new PiProviderConfigService({
      agentDir: "/tmp/pi-runtime-test",
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
    });

    await expect(
      service.authenticate("openai", "api_key", { prompt: vi.fn(async () => ""), notify: vi.fn() }),
    ).rejects.toThrow("API key is required.");
    expect(authStorage.get("openai")).toBeUndefined();
  });

  it("uses the Pi AI OAuth login contract and persists its complete credential", async () => {
    const authStorage = AuthStorage.inMemory();
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    const anthropicProvider = builtinProviders().find((provider) => provider.id === "anthropic");
    if (!anthropicProvider?.auth.oauth) {
      throw new Error("Expected the built-in Anthropic OAuth provider");
    }
    const credential = {
      type: "oauth" as const,
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
    };
    const oauthLogin = vi.fn(async () => credential);
    const provider = {
      ...anthropicProvider,
      id: "test-browser-oauth",
      auth: { ...anthropicProvider.auth, oauth: { ...anthropicProvider.auth.oauth, login: oauthLogin } },
    };
    const service = new PiProviderConfigService({
      agentDir: "/tmp/pi-runtime-test",
      authStorage,
      modelRegistry,
      providerCatalogLoader: async () => ({ builtinProviders: () => [provider] }),
    });
    const callbacks: AuthLoginCallbacks = { prompt: vi.fn(), notify: vi.fn() };

    await service.authenticate("test-browser-oauth", "oauth", callbacks);

    expect(oauthLogin).toHaveBeenCalledWith(callbacks);
    expect(authStorage.get("test-browser-oauth")).toEqual(credential);
  });

  it("does not persist a provider credential after authentication is cancelled", async () => {
    const authStorage = AuthStorage.inMemory();
    const anthropicProvider = builtinProviders().find((provider) => provider.id === "anthropic");
    if (!anthropicProvider?.auth.oauth) {
      throw new Error("Expected the built-in Anthropic OAuth provider");
    }
    let resolveLogin:
      | ((credential: { type: "oauth"; access: string; refresh: string; expires: number }) => void)
      | undefined;
    const oauthLogin = vi.fn(
      async () =>
        await new Promise<{ type: "oauth"; access: string; refresh: string; expires: number }>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    const provider = {
      ...anthropicProvider,
      id: "cancelled-oauth",
      auth: { ...anthropicProvider.auth, oauth: { ...anthropicProvider.auth.oauth, login: oauthLogin } },
    };
    const service = new PiProviderConfigService({
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
      providerCatalogLoader: async () => ({ builtinProviders: () => [provider] }),
    });
    const controller = new AbortController();
    const authentication = service.authenticate("cancelled-oauth", "oauth", {
      prompt: vi.fn(),
      notify: vi.fn(),
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(oauthLogin).toHaveBeenCalledOnce());
    controller.abort();
    resolveLogin?.({ type: "oauth", access: "access", refresh: "refresh", expires: Date.now() + 60_000 });

    await expect(authentication).rejects.toMatchObject({ code: "cancelled" });
    expect(authStorage.get("cancelled-oauth")).toBeUndefined();
  });

  it("rejects unknown authentication methods instead of treating them as API keys", async () => {
    const authStorage = AuthStorage.inMemory();
    const prompt = vi.fn(async () => "secret");
    const service = new PiProviderConfigService({
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
    });

    await expect(
      service.authenticate("openai", "unknown" as "api_key", { prompt, notify: vi.fn() }),
    ).rejects.toMatchObject({ code: "unsupported_method" });
    expect(prompt).not.toHaveBeenCalled();
    expect(authStorage.get("openai")).toBeUndefined();
  });

  it("keeps provider snapshots independent from a Desktop-probed Pi executable version", async () => {
    const authStorage = AuthStorage.inMemory();
    const service = new PiProviderConfigService({
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot).not.toHaveProperty("version");
  });

  it("removes only stored credentials and re-resolves environment auth", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-environment";
    const authStorage = AuthStorage.inMemory({ openai: { type: "api_key", key: "sk-stored" } });
    const service = new PiProviderConfigService({
      agentDir: "/tmp/pi-runtime-test",
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
    });

    try {
      await service.removeCredential("openai");
      const snapshot = await service.getSnapshot();

      expect(authStorage.get("openai")).toBeUndefined();
      expect(findProvider(snapshot, "openai").authSource).toBe("env");
    } finally {
      if (previousKey === undefined) {
        process.env.OPENAI_API_KEY = undefined;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  });

  it("does not turn a successful credential removal into a failure when snapshot refresh is unavailable", async () => {
    const authStorage = AuthStorage.inMemory({ openai: { type: "api_key", key: "sk-stored" } });
    const modelRegistry = ModelRegistry.inMemory(authStorage);
    vi.spyOn(modelRegistry, "refresh").mockImplementation(() => {
      throw new Error("refresh unavailable");
    });
    const service = new PiProviderConfigService({ authStorage, modelRegistry });

    await expect(service.removeCredential("openai")).resolves.toBeUndefined();

    expect(authStorage.get("openai")).toBeUndefined();
  });
});

describe("inferPiProviderAuthSource", () => {
  it("prefers oauth credentials when present", () => {
    expect(
      inferPiProviderAuthSource(
        { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 1_000 },
        { configured: true, source: "stored" },
      ),
    ).toBe("oauth");
  });

  it("maps stored API keys to auth_file", () => {
    expect(inferPiProviderAuthSource({ type: "api_key", key: "sk-test" }, { configured: true, source: "stored" })).toBe(
      "auth_file",
    );
  });

  it("maps environment auth to env", () => {
    expect(inferPiProviderAuthSource(undefined, { configured: true, source: "environment" })).toBe("env");
  });

  it("maps command/key-backed models.json auth to external", () => {
    expect(inferPiProviderAuthSource(undefined, { configured: true, source: "models_json_command" })).toBe("external");
  });
});

describe("buildPiProviderConfigSnapshot", () => {
  it("builds provider inventory and exposes only currently available models", () => {
    const authStorage = AuthStorage.inMemory({
      openai: { type: "api_key", key: "sk-openai" },
      anthropic: { type: "oauth", access: "access", refresh: "refresh", expires: Date.now() + 60_000 },
    });
    const modelRegistry = ModelRegistry.inMemory(authStorage);

    const snapshot = buildPiProviderConfigSnapshot(authStorage, modelRegistry, builtinProviders());
    const openAiProvider = snapshot.providers.find((provider) => provider.id === "openai");
    const anthropicProvider = snapshot.providers.find((provider) => provider.id === "anthropic");
    const availableModelKeys = modelRegistry
      .getAvailable()
      .map((model) => `${model.provider}:${model.id}`)
      .sort();

    expect(openAiProvider).toMatchObject({
      id: "openai",
      hasAuth: true,
      available: true,
      authSource: "auth_file",
      authMethods: [{ kind: "api_key", label: "OpenAI API key" }],
    });
    expect(anthropicProvider).toMatchObject({
      id: "anthropic",
      hasAuth: true,
      available: true,
      authSource: "oauth",
      authMethods: [
        { kind: "oauth", label: "Anthropic (Claude Pro/Max)" },
        { kind: "api_key", label: "Anthropic API key" },
      ],
    });
    expect(snapshot.models.map((model) => `${model.providerId}:${model.modelId}`).sort()).toEqual(availableModelKeys);
    expect(snapshot.models.every((model) => !("available" in model))).toBe(true);
  });

  it("includes oauth-only providers from the runtime inventory even before login", () => {
    const authStorage = AuthStorage.inMemory();
    const modelRegistry = ModelRegistry.inMemory(authStorage);

    const snapshot = buildPiProviderConfigSnapshot(authStorage, modelRegistry, builtinProviders());
    const codexProvider = snapshot.providers.find((provider) => provider.id === "openai-codex");

    expect(codexProvider).toMatchObject({
      id: "openai-codex",
      hasAuth: false,
      available: false,
      authSource: "none",
      authMethods: [{ kind: "oauth", label: "OpenAI (ChatGPT Plus/Pro)" }],
    });
  });

  it("derives structured API-key and external setup capabilities from Pi providers", () => {
    const authStorage = AuthStorage.inMemory();
    const modelRegistry = ModelRegistry.inMemory(authStorage);

    const snapshot = buildPiProviderConfigSnapshot(authStorage, modelRegistry, builtinProviders());

    expect(findProvider(snapshot, "cloudflare-ai-gateway").authMethods).toEqual([
      { kind: "api_key", label: "Cloudflare API key" },
    ]);
    expect(findProvider(snapshot, "amazon-bedrock").authMethods).toEqual([
      { kind: "external", label: "AWS credentials" },
    ]);
  });
});
