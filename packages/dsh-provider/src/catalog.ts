import type { Config, PiAiProviderProfile } from "@deepseek-ai/dsh-llm-pi-ai";

import { YISHAN_DSH_TEST_REPLAY_MODEL, YISHAN_DSH_TEST_REPLAY_PROVIDER, isDshTestReplayEnabled } from "./replay";

/** The direct DSH adapter route, intentionally outside the pi-ai catalog. */
export const DIRECT_DEEPSEEK_PROVIDER = "deepseek-official";
/** The pi-ai catalog route for DeepSeek. */
export const PI_AI_DEEPSEEK_PROVIDER = "deepseek";

/** The required number of fixed routes from the pi-ai catalog. */
export const YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT = 36;
/** The required number of final active DSH routes: pi-ai routes plus direct DeepSeek. */
export const YISHAN_DSH_ACTIVE_PROVIDER_COUNT = 37;

/** The only routes permitted to defer authentication to system or cloud credentials. */
export const YISHAN_AMBIENT_PI_AI_PROVIDER_IDS = [
  "amazon-bedrock",
  "google-vertex",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
] as const;

/** A provider identifier explicitly permitted to use system or cloud ambient credentials. */
export type AmbientPiAiProviderId = (typeof YISHAN_AMBIENT_PI_AI_PROVIDER_IDS)[number];

/** The authentication method a fixed pi-ai catalog route can use in Yishan. */
export type PiAiAuthenticationKind = "api-key" | "ambient";

/** A route whose API key must resolve only from the account-scoped DSH reference store. */
export type ApiKeyPiAiProviderManifestEntry = {
  provider: string;
  authentication: "api-key";
  apiKeyEnv: string;
};

/** A route explicitly permitted to use its provider's system or cloud ambient credentials. */
export type AmbientPiAiProviderManifestEntry = {
  provider: AmbientPiAiProviderId;
  authentication: "ambient";
};

/** One fixed route from the installed pi-ai catalog. */
export type PiAiProviderManifestEntry = ApiKeyPiAiProviderManifestEntry | AmbientPiAiProviderManifestEntry;

const API_KEY = "api-key" as const;
const AMBIENT = "ambient" as const;

/**
 * Fixed inventory for pi-ai 0.82.1, which is bundled by dsh-llm-pi-ai 0.1.1-rc.2.
 *
 * API-key routes name a DSH reference and fail when that account-scoped
 * `.credentials.yaml` value is absent; they cannot fall back to process variables
 * or Pi `auth.json`. Only the four listed ambient routes omit a reference and may
 * use their provider's system or cloud ambient credential discovery.
 */
export const YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST = [
  { provider: "amazon-bedrock", authentication: AMBIENT },
  { provider: "ant-ling", authentication: API_KEY, apiKeyEnv: "ANT_LING_API_KEY" },
  { provider: "anthropic", authentication: API_KEY, apiKeyEnv: "ANTHROPIC_API_KEY" },
  { provider: "azure-openai-responses", authentication: API_KEY, apiKeyEnv: "AZURE_OPENAI_API_KEY" },
  { provider: "cerebras", authentication: API_KEY, apiKeyEnv: "CEREBRAS_API_KEY" },
  { provider: "cloudflare-ai-gateway", authentication: AMBIENT },
  { provider: "cloudflare-workers-ai", authentication: AMBIENT },
  { provider: PI_AI_DEEPSEEK_PROVIDER, authentication: API_KEY, apiKeyEnv: "DEEPSEEK_API_KEY" },
  { provider: "fireworks", authentication: API_KEY, apiKeyEnv: "FIREWORKS_API_KEY" },
  { provider: "github-copilot", authentication: API_KEY, apiKeyEnv: "COPILOT_GITHUB_TOKEN" },
  { provider: "google", authentication: API_KEY, apiKeyEnv: "GEMINI_API_KEY" },
  { provider: "google-vertex", authentication: AMBIENT },
  { provider: "groq", authentication: API_KEY, apiKeyEnv: "GROQ_API_KEY" },
  { provider: "huggingface", authentication: API_KEY, apiKeyEnv: "HF_TOKEN" },
  { provider: "kimi-coding", authentication: API_KEY, apiKeyEnv: "KIMI_API_KEY" },
  { provider: "minimax", authentication: API_KEY, apiKeyEnv: "MINIMAX_API_KEY" },
  { provider: "minimax-cn", authentication: API_KEY, apiKeyEnv: "MINIMAX_CN_API_KEY" },
  { provider: "mistral", authentication: API_KEY, apiKeyEnv: "MISTRAL_API_KEY" },
  { provider: "moonshotai", authentication: API_KEY, apiKeyEnv: "MOONSHOT_API_KEY" },
  { provider: "moonshotai-cn", authentication: API_KEY, apiKeyEnv: "MOONSHOT_API_KEY" },
  { provider: "nvidia", authentication: API_KEY, apiKeyEnv: "NVIDIA_API_KEY" },
  { provider: "openai", authentication: API_KEY, apiKeyEnv: "OPENAI_API_KEY" },
  { provider: "opencode", authentication: API_KEY, apiKeyEnv: "OPENCODE_API_KEY" },
  { provider: "opencode-go", authentication: API_KEY, apiKeyEnv: "OPENCODE_API_KEY" },
  { provider: "openrouter", authentication: API_KEY, apiKeyEnv: "OPENROUTER_API_KEY" },
  { provider: "qwen-token-plan", authentication: API_KEY, apiKeyEnv: "QWEN_TOKEN_PLAN_API_KEY" },
  { provider: "qwen-token-plan-cn", authentication: API_KEY, apiKeyEnv: "QWEN_TOKEN_PLAN_CN_API_KEY" },
  { provider: "together", authentication: API_KEY, apiKeyEnv: "TOGETHER_API_KEY" },
  { provider: "vercel-ai-gateway", authentication: API_KEY, apiKeyEnv: "AI_GATEWAY_API_KEY" },
  { provider: "xai", authentication: API_KEY, apiKeyEnv: "XAI_API_KEY" },
  { provider: "xiaomi", authentication: API_KEY, apiKeyEnv: "XIAOMI_API_KEY" },
  { provider: "xiaomi-token-plan-ams", authentication: API_KEY, apiKeyEnv: "XIAOMI_TOKEN_PLAN_AMS_API_KEY" },
  { provider: "xiaomi-token-plan-cn", authentication: API_KEY, apiKeyEnv: "XIAOMI_TOKEN_PLAN_CN_API_KEY" },
  { provider: "xiaomi-token-plan-sgp", authentication: API_KEY, apiKeyEnv: "XIAOMI_TOKEN_PLAN_SGP_API_KEY" },
  { provider: "zai", authentication: API_KEY, apiKeyEnv: "ZAI_API_KEY" },
  { provider: "zai-coding-cn", authentication: API_KEY, apiKeyEnv: "ZAI_CODING_CN_API_KEY" },
] as const satisfies readonly PiAiProviderManifestEntry[];

/** Routes that Yishan does not support in this fixed runtime. */
export const YISHAN_UNSUPPORTED_PI_AI_PROVIDERS = ["openai-codex", "radius"] as const;
const unsupportedPiAiProviderSet = new Set<string>(YISHAN_UNSUPPORTED_PI_AI_PROVIDERS);

/** Fixed routes that Yishan permits the adapter to register and expose. */
export const YISHAN_PI_AI_PROVIDER_ALLOWLIST = new Set(
  YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST.map(({ provider }) => provider),
);

/** The catalog exported to the adapter after applying Yishan's fixed allowlist. */
export const YISHAN_PI_AI_CATALOG: readonly PiAiProviderManifestEntry[] = YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST;

/** Final fixed DSH route IDs: 36 allowlisted pi-ai routes and direct DeepSeek. */
export const YISHAN_DSH_ACTIVE_PROVIDER_IDS = [
  DIRECT_DEEPSEEK_PROVIDER,
  ...YISHAN_PI_AI_CATALOG.map(({ provider }) => provider),
] as const;

/** Final fixed DSH route set used to detect registration or catalog drift. */
export const YISHAN_DSH_ACTIVE_PROVIDER_SET = new Set<string>(YISHAN_DSH_ACTIVE_PROVIDER_IDS);

/** Static plugin configuration; no user settings, YAML, or dynamic provider loading is used. */
export const YISHAN_PI_AI_CONFIG: Config = {
  providers: Object.fromEntries(
    YISHAN_PI_AI_CATALOG.map((entry) => [
      entry.provider,
      entry.authentication === API_KEY ? { apiKeyEnv: entry.apiKeyEnv } : {},
    ]),
  ) as Record<string, PiAiProviderProfile>,
};

/** Refuses direct/pi-ai provider collisions before the adapter is registered. */
export function assertPiAiProviderManifest(): void {
  if (
    YISHAN_PI_AI_CATALOG.length !== YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT ||
    YISHAN_PI_AI_PROVIDER_ALLOWLIST.size !== YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT
  ) {
    throw new Error(`invalid Yishan pi-ai active route count: expected ${YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT}`);
  }
  if (
    YISHAN_DSH_ACTIVE_PROVIDER_IDS.length !== YISHAN_DSH_ACTIVE_PROVIDER_COUNT ||
    YISHAN_DSH_ACTIVE_PROVIDER_SET.size !== YISHAN_DSH_ACTIVE_PROVIDER_COUNT
  ) {
    throw new Error(`invalid Yishan DSH active route count: expected ${YISHAN_DSH_ACTIVE_PROVIDER_COUNT}`);
  }

  const providers = new Set<string>();
  for (const entry of YISHAN_PI_AI_CATALOG) {
    if (unsupportedPiAiProviderSet.has(entry.provider)) {
      throw new Error(`unsupported Yishan pi-ai provider route: ${entry.provider}`);
    }
    if (entry.provider === DIRECT_DEEPSEEK_PROVIDER || providers.has(entry.provider)) {
      throw new Error(`invalid Yishan pi-ai provider route: ${entry.provider}`);
    }
    if (entry.authentication === API_KEY && !entry.apiKeyEnv) {
      throw new Error(`invalid Yishan pi-ai credential classification: ${entry.provider}`);
    }
    if (entry.authentication === AMBIENT && !YISHAN_AMBIENT_PI_AI_PROVIDER_IDS.includes(entry.provider)) {
      throw new Error(`invalid Yishan ambient pi-ai provider route: ${entry.provider}`);
    }
    providers.add(entry.provider);
  }
}

/** Authentication metadata safe to expose over the runtime provider catalog RPC. */
export type ProviderAuthentication = "api-key" | "ambient";

/** One model qualified by the exact active provider route that accepts it. */
export type ProviderCatalogModel = {
  provider: string;
  id: string;
  name: string;
};

/** One secret-free active runtime provider entry. */
export type ProviderCatalogEntry = {
  id: string;
  authentication: ProviderAuthentication;
  setupRequired: boolean;
  models: ProviderCatalogModel[];
};

/** The secret-free catalog returned by `yishan.v1.providers.list`. */
export type ProviderCatalog = { providers: ProviderCatalogEntry[] };

/** LLM catalog operations used by Yishan provider selection. */
export type RuntimeLlmCatalog = {
  listProviders(): readonly { id: string }[];
  listModels(provider: string): Promise<readonly { provider: string; id: string; name: string }[]>;
  /** Resolves optional exact-model capacity when supported by the runtime. */
  resolveModelInfo?: (provider: string, model: string) => Promise<{ context?: { contextWindow: number } }>;
};

/** Raised when a caller selects no active provider/model route. */
export class ProviderSelectionError extends Error {
  /** Stable machine-readable provider-selection failure code. */
  readonly code = "YISHAN_PROVIDER_SELECTION_INVALID";

  /** Creates a provider selection failure without reflecting caller input. */
  constructor() {
    super("provider and model must identify an active runtime route");
    this.name = "ProviderSelectionError";
  }
}

/** Lists only explicitly active runtime routes with safe, provider-qualified model metadata. */
export async function listProviders(llm: RuntimeLlmCatalog): Promise<ProviderCatalog> {
  const registeredProviderIds = new Set(llm.listProviders().map(({ id }) => id));
  const activeProviderIds = YISHAN_DSH_ACTIVE_PROVIDER_IDS.filter((provider) => registeredProviderIds.has(provider));
  const providers = await Promise.all(
    activeProviderIds.map(async (provider) => await createProviderCatalogEntry(llm, provider)),
  );
  if (isDshTestReplayEnabled()) providers.push(createTestReplayProviderCatalogEntry());
  return { providers };
}

/** Validates an exact provider/model selection against the current active runtime catalog. */
export async function validateProviderSelection(
  llm: RuntimeLlmCatalog,
  selection: { provider?: string; model?: string },
): Promise<void> {
  if (selection.provider === undefined || selection.model === undefined) throw new ProviderSelectionError();
  const catalog = await listProviders(llm);
  const provider = catalog.providers.find(({ id }) => id === selection.provider);
  if (provider?.models.some(({ id }) => id === selection.model) !== true) throw new ProviderSelectionError();
}

function createTestReplayProviderCatalogEntry(): ProviderCatalogEntry {
  return {
    id: YISHAN_DSH_TEST_REPLAY_PROVIDER,
    authentication: "ambient",
    setupRequired: false,
    models: [
      {
        provider: YISHAN_DSH_TEST_REPLAY_PROVIDER,
        id: YISHAN_DSH_TEST_REPLAY_MODEL,
        name: YISHAN_DSH_TEST_REPLAY_MODEL,
      },
    ],
  };
}

async function createProviderCatalogEntry(llm: RuntimeLlmCatalog, provider: string): Promise<ProviderCatalogEntry> {
  try {
    const discoveredModels = await llm.listModels(provider);
    return {
      id: provider,
      authentication: getProviderAuthentication(provider),
      setupRequired: getProviderAuthentication(provider) === "api-key",
      models: discoveredModels
        .filter((model) => model.provider === provider)
        .map(({ id, name }) => ({ provider, id, name })),
    };
  } catch {
    // Do not forward adapter errors because they can include credential or configuration details.
    throw new Error("provider catalog is unavailable");
  }
}

function getProviderAuthentication(provider: string): ProviderAuthentication {
  return provider === DIRECT_DEEPSEEK_PROVIDER || !isAmbientPiAiProvider(provider) ? "api-key" : "ambient";
}

function isAmbientPiAiProvider(provider: string): provider is AmbientPiAiProviderId {
  return YISHAN_AMBIENT_PI_AI_PROVIDER_IDS.some((ambientProvider) => ambientProvider === provider);
}

/** One exact provider/model route whose context capacity is requested. */
export type ProviderContextWindowRoute = { provider: string; model: string };

/** One valid exact route context capacity. */
export type ProviderContextWindow = ProviderContextWindowRoute & { contextWindow: number };

/** Resolves capacities only for active, provider-owned model routes. */
export async function listProviderContextWindows(
  llm: RuntimeLlmCatalog,
  routes: readonly ProviderContextWindowRoute[],
): Promise<{ contextWindows: ProviderContextWindow[] }> {
  validateContextWindowRoutes(routes);
  const catalog = await listProviders(llm);
  const ownedRoutes = new Set(
    catalog.providers.flatMap((provider) => provider.models.map((model) => `${provider.id}\u0000${model.id}`)),
  );
  if (routes.some((route) => !ownedRoutes.has(`${route.provider}\u0000${route.model}`))) {
    throw new Error("provider context windows are unavailable");
  }
  const contextWindows = await Promise.all(
    routes.map(async ({ provider, model }) => {
      const contextWindow = await resolveContextWindow(llm, provider, model);
      return contextWindow === undefined ? undefined : { provider, model, contextWindow };
    }),
  );
  return {
    contextWindows: contextWindows.filter(
      (contextWindow): contextWindow is ProviderContextWindow => contextWindow !== undefined,
    ),
  };
}

function validateContextWindowRoutes(routes: readonly ProviderContextWindowRoute[]): void {
  const seenRoutes = new Set<string>();
  for (const route of routes) {
    if (!route.provider || !route.model || seenRoutes.has(`${route.provider}\u0000${route.model}`)) {
      throw new Error("invalid provider context window routes");
    }
    seenRoutes.add(`${route.provider}\u0000${route.model}`);
  }
}

/** Resolves a safe context capacity without requiring model metadata to be present. */
async function resolveContextWindow(
  llm: RuntimeLlmCatalog,
  provider: string,
  model: string,
): Promise<number | undefined> {
  try {
    const resolvedModel = llm.resolveModelInfo ? await llm.resolveModelInfo(provider, model) : undefined;
    const contextWindow = resolvedModel?.context?.contextWindow;
    return typeof contextWindow === "number" && Number.isSafeInteger(contextWindow) && contextWindow > 0
      ? contextWindow
      : undefined;
  } catch {
    return undefined;
  }
}
