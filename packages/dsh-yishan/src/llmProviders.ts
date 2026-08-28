import type { Config, PiAiProviderProfile } from "@deepseek-ai/dsh-llm-pi-ai";

/** The direct DSH adapter route, intentionally outside the pi-ai catalog. */
export const DIRECT_DEEPSEEK_PROVIDER = "deepseek-official";
/** The pi-ai catalog route for DeepSeek. */
export const PI_AI_DEEPSEEK_PROVIDER = "deepseek";

/** The required number of fixed routes from the pi-ai catalog. */
export const YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT = 36;
/** The required number of final active DSH routes: pi-ai routes plus direct DeepSeek. */
export const YISHAN_DSH_ACTIVE_PROVIDER_COUNT = 37;

/** The authentication method a fixed pi-ai catalog route can use in Yishan. */
export type PiAiAuthenticationKind = "api-key" | "ambient";

/** One fixed route from the installed pi-ai catalog. */
export type PiAiProviderManifestEntry = {
  provider: string;
  authentication: PiAiAuthenticationKind;
  apiKeyEnv?: string;
};

const API_KEY = "api-key" as const;
const AMBIENT = "ambient" as const;

/**
 * Fixed inventory for pi-ai 0.82.1, which is bundled by dsh-llm-pi-ai 0.1.1-rc.2.
 *
 * API-key routes use only reference names. Ambient routes rely on the provider's
 * native environment discovery. This is the exported 36-route pi-ai portion of the active Yishan DSH set.
 */
export const YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST: readonly PiAiProviderManifestEntry[] = [
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
];

/** Routes that Yishan does not support in this fixed runtime. */
export const YISHAN_UNSUPPORTED_PI_AI_PROVIDERS = ["openai-codex", "radius"] as const;
const unsupportedPiAiProviderSet = new Set<string>(YISHAN_UNSUPPORTED_PI_AI_PROVIDERS);

/** Fixed routes that Yishan permits the adapter to register and expose. */
export const YISHAN_PI_AI_PROVIDER_ALLOWLIST = new Set(
  YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST.map(({ provider }) => provider),
);

/** The catalog exported to the adapter after applying Yishan's fixed allowlist. */
export const YISHAN_PI_AI_CATALOG = YISHAN_PI_AI_ACTIVE_PROVIDER_MANIFEST;

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
    YISHAN_PI_AI_CATALOG.map(({ provider, authentication, apiKeyEnv }) => [
      provider,
      authentication === API_KEY ? { apiKeyEnv } : {},
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
    if ((entry.authentication === API_KEY) !== (entry.apiKeyEnv !== undefined)) {
      throw new Error(`invalid Yishan pi-ai credential classification: ${entry.provider}`);
    }
    providers.add(entry.provider);
  }
}
