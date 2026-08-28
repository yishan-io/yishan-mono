/**
 * Static catalog of providers supported by the yishan pi agent, mirroring pi's
 * env-api-keys envMap + docs provider table (pi 0.83.0). The pinned id list in
 * piProviders.test.ts guards against drift; bump both when pi updates.
 *
 * Authentication capability only: provider ids, display names, credential env
 * rules, and auth modes. Visual metadata (icons, brand colors, SVG assets)
 * lives in `../ui/piProviderVisuals` so this Model module stays framework-free
 * (desktop8 Phase 29).
 */

export type PiProviderAuthMode = "api_key" | "oauth" | "both";

export type PiProviderCatalogEntry = {
  id: string;
  name: string;
  envVar?: string;
  authMode: PiProviderAuthMode;
  /** True when the provider is a paid subscription (ChatGPT/Copilot/Pro/Grok). */
  hasSubscription?: boolean;
  /** Provider-scoped env var names pi reads from the stored credential. */
  envVars?: string[];
};

/**
 * Providers supported by the yishan pi agent, sorted alphabetically by display
 * name so pickers show OpenAI and OpenAI Codex adjacent. The pinned id
 * snapshot in piProviders.test.ts is order-independent.
 */
export const PI_PROVIDER_CATALOG: PiProviderCatalogEntry[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    authMode: "both",
    hasSubscription: true,
  },
  {
    id: "ant-ling",
    name: "Ant Ling",
    envVar: "ANT_LING_API_KEY",
    authMode: "api_key",
  },
  {
    id: "azure-openai-responses",
    name: "Azure OpenAI Responses",
    envVar: "AZURE_OPENAI_API_KEY",
    authMode: "api_key",
    envVars: ["AZURE_OPENAI_BASE_URL", "AZURE_OPENAI_RESOURCE_NAME"],
  },
  {
    id: "openai",
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    authMode: "api_key",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    envVar: "NVIDIA_API_KEY",
    authMode: "api_key",
  },
  {
    id: "google",
    name: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    authMode: "api_key",
  },
  {
    id: "google-vertex",
    name: "Google Vertex AI",
    envVar: "GOOGLE_CLOUD_API_KEY",
    authMode: "api_key",
    envVars: ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    envVar: "AWS_BEARER_TOKEN_BEDROCK",
    authMode: "api_key",
    envVars: ["AWS_PROFILE"],
  },
  {
    id: "mistral",
    name: "Mistral",
    envVar: "MISTRAL_API_KEY",
    authMode: "api_key",
  },
  {
    id: "groq",
    name: "Groq",
    envVar: "GROQ_API_KEY",
    authMode: "api_key",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    envVar: "CEREBRAS_API_KEY",
    authMode: "api_key",
  },
  {
    id: "cloudflare-ai-gateway",
    name: "Cloudflare AI Gateway",
    envVar: "CLOUDFLARE_API_KEY",
    authMode: "api_key",
    envVars: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_GATEWAY_ID"],
  },
  {
    id: "cloudflare-workers-ai",
    name: "Cloudflare Workers AI",
    envVar: "CLOUDFLARE_API_KEY",
    authMode: "api_key",
    envVars: ["CLOUDFLARE_ACCOUNT_ID"],
  },
  {
    id: "xai",
    name: "xAI",
    envVar: "XAI_API_KEY",
    authMode: "both",
    hasSubscription: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    authMode: "both",
  },
  {
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    envVar: "AI_GATEWAY_API_KEY",
    authMode: "api_key",
  },
  {
    id: "zai",
    name: "ZAI Coding Plan (Global)",
    envVar: "ZAI_API_KEY",
    authMode: "api_key",
  },
  {
    id: "zai-coding-cn",
    name: "ZAI Coding Plan (China)",
    envVar: "ZAI_CODING_CN_API_KEY",
    authMode: "api_key",
  },
  {
    id: "opencode",
    name: "OpenCode Zen",
    envVar: "OPENCODE_API_KEY",
    authMode: "api_key",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    envVar: "OPENCODE_API_KEY",
    authMode: "api_key",
  },
  {
    id: "radius",
    name: "Radius",
    envVar: "RADIUS_API_KEY",
    authMode: "both",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    envVar: "HF_TOKEN",
    authMode: "api_key",
  },
  {
    id: "fireworks",
    name: "Fireworks",
    envVar: "FIREWORKS_API_KEY",
    authMode: "api_key",
  },
  {
    id: "together",
    name: "Together AI",
    envVar: "TOGETHER_API_KEY",
    authMode: "api_key",
  },
  {
    id: "kimi-coding",
    name: "Kimi For Coding",
    envVar: "KIMI_API_KEY",
    authMode: "api_key",
  },
  {
    id: "minimax",
    name: "MiniMax",
    envVar: "MINIMAX_API_KEY",
    authMode: "api_key",
  },
  {
    id: "minimax-cn",
    name: "MiniMax (China)",
    envVar: "MINIMAX_CN_API_KEY",
    authMode: "api_key",
  },
  {
    id: "moonshotai",
    name: "Moonshot AI",
    envVar: "MOONSHOT_API_KEY",
    authMode: "api_key",
  },
  {
    id: "moonshotai-cn",
    name: "Moonshot AI (China)",
    envVar: "MOONSHOT_API_KEY",
    authMode: "api_key",
  },
  {
    id: "qwen-token-plan",
    name: "Qwen Token Plan",
    envVar: "QWEN_TOKEN_PLAN_API_KEY",
    authMode: "api_key",
  },
  {
    id: "qwen-token-plan-cn",
    name: "Qwen Token Plan (China)",
    envVar: "QWEN_TOKEN_PLAN_CN_API_KEY",
    authMode: "api_key",
  },
  {
    id: "xiaomi",
    name: "Xiaomi MiMo",
    envVar: "XIAOMI_API_KEY",
    authMode: "api_key",
  },
  {
    id: "xiaomi-token-plan-cn",
    name: "Xiaomi MiMo Token Plan (China)",
    envVar: "XIAOMI_TOKEN_PLAN_CN_API_KEY",
    authMode: "api_key",
  },
  {
    id: "xiaomi-token-plan-ams",
    name: "Xiaomi MiMo Token Plan (Amsterdam)",
    envVar: "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
    authMode: "api_key",
  },
  {
    id: "xiaomi-token-plan-sgp",
    name: "Xiaomi MiMo Token Plan (Singapore)",
    envVar: "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
    authMode: "api_key",
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    authMode: "oauth",
    hasSubscription: true,
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    envVar: "COPILOT_GITHUB_TOKEN",
    authMode: "both",
    hasSubscription: true,
  },
];

// Keep the exported catalog sorted by display name regardless of entry order.
PI_PROVIDER_CATALOG.sort((left, right) => left.name.localeCompare(right.name));

const PI_PROVIDER_BY_ID = new Map(PI_PROVIDER_CATALOG.map((entry) => [entry.id, entry]));

export function getPiProviderCatalogEntry(providerId: string): PiProviderCatalogEntry | undefined {
  return PI_PROVIDER_BY_ID.get(providerId);
}

export function isKnownPiProviderId(providerId: string): boolean {
  return PI_PROVIDER_BY_ID.has(providerId);
}

export function getPiProviderDisplayName(providerId: string): string {
  return getPiProviderCatalogEntry(providerId)?.name ?? providerId;
}

export function isPiProviderApiKeyCapable(providerId: string): boolean {
  const entry = getPiProviderCatalogEntry(providerId);
  return entry !== undefined && entry.authMode !== "oauth";
}

/** True when the provider supports account sign-in (OAuth) via Pi /login. */
export function isPiProviderOAuthCapable(providerId: string): boolean {
  const entry = getPiProviderCatalogEntry(providerId);
  return entry !== undefined && entry.authMode !== "api_key";
}

/** True when the provider is a paid subscription (ChatGPT/Copilot/Pro/Grok). */
export function isPiProviderSubscriptionCapable(providerId: string): boolean {
  return getPiProviderCatalogEntry(providerId)?.hasSubscription === true;
}

/**
 * Derives prefilled provider-scoped env values from an ambient source label
 * (e.g. "AWS_PROFILE: ai-bedrock" → { AWS_PROFILE: "ai-bedrock" }) so the
 * user can pin the detected credential into auth.json in one click. Returns
 * null when the source cannot be pinned.
 */
export function getPiProviderPinEnv(providerId: string, source: string | undefined): Record<string, string> | null {
  if (!source) {
    return null;
  }
  const envVars = getPiProviderCatalogEntry(providerId)?.envVars;
  if (!envVars || envVars.length === 0) {
    return null;
  }
  const awsProfilePrefix = "AWS_PROFILE: ";
  if (source.startsWith(awsProfilePrefix)) {
    const profile = source.slice(awsProfilePrefix.length).trim();
    return profile ? { AWS_PROFILE: profile } : null;
  }
  return null;
}
