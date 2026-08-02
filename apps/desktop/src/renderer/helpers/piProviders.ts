import type { IconType } from "react-icons";
import { FaAmazon, FaMicrosoft } from "react-icons/fa6";
import { LuCloud } from "react-icons/lu";
import {
  SiAnthropic,
  SiCloudflare,
  SiDeepseek,
  SiGithubcopilot,
  SiGooglecloud,
  SiGooglegemini,
  SiHuggingface,
  SiMinimax,
  SiMistralai,
  SiMoonshotai,
  SiNvidia,
  SiOpencode,
  SiOpenrouter,
  SiQwen,
  SiVercel,
  SiXiaomi,
} from "react-icons/si";

import { KimiIcon } from "./piProviderIcons";

export type PiProviderAuthMode = "api_key" | "oauth" | "both";

export type PiProviderCatalogEntry = {
  id: string;
  name: string;
  envVar?: string;
  authMode: PiProviderAuthMode;
  icon: IconType;
  /** Official brand color (hex without `#`) from the Simple Icons dataset. */
  brandColor?: string;
  /** Path (relative to the renderer public dir) of an official brand SVG asset. */
  assetIcon?: string;
  /** True when the SVG asset is monochrome and needs a white filter in dark mode. */
  monochrome?: boolean;
  /** True when the provider is a paid subscription (ChatGPT/Copilot/Pro/Grok). */
  hasSubscription?: boolean;
  /** Provider-scoped env var names pi reads from the stored credential. */
  envVars?: string[];
  /** Visual scale for assets with padding around the mark (e.g. codex.svg). */
  iconScale?: number;
};

const FALLBACK_PROVIDER_ICON: IconType = LuCloud;

/**
 * Static catalog of providers supported by the yishan pi agent, mirroring pi's
 * env-api-keys envMap + docs provider table (pi 0.83.0). The pinned id list in
 * piProviders.test.ts guards against drift; bump both when pi updates.
 *
 * Icons: react-icons/si (Simple Icons brand marks) + react-icons/fa6 for
 * Amazon/Microsoft, with brandColor values from the Simple Icons v16 dataset;
 * official SVG assets (Wikimedia Commons, same practice as the app's own
 * preset-icons) for OpenAI/Groq/Cerebras/Z.ai and the reused Codex mark.
 * Providers without any brand mark use a neutral LuCloud fallback.
 */
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
    icon: SiAnthropic,
    brandColor: "191919",
    hasSubscription: true,
  },
  {
    id: "ant-ling",
    name: "Ant Ling",
    envVar: "ANT_LING_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/antling.svg",
    monochrome: true,
  },
  {
    id: "azure-openai-responses",
    name: "Azure OpenAI Responses",
    envVar: "AZURE_OPENAI_API_KEY",
    authMode: "api_key",
    icon: FaMicrosoft,
    brandColor: "0078D4",
    envVars: ["AZURE_OPENAI_BASE_URL", "AZURE_OPENAI_RESOURCE_NAME"],
  },
  {
    id: "openai",
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/openai.svg",
    monochrome: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    authMode: "api_key",
    icon: SiDeepseek,
    brandColor: "5786FE",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    envVar: "NVIDIA_API_KEY",
    authMode: "api_key",
    icon: SiNvidia,
    brandColor: "76B900",
  },
  {
    id: "google",
    name: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    authMode: "api_key",
    icon: SiGooglegemini,
    brandColor: "8E75B2",
  },
  {
    id: "google-vertex",
    name: "Google Vertex AI",
    envVar: "GOOGLE_CLOUD_API_KEY",
    authMode: "api_key",
    icon: SiGooglecloud,
    brandColor: "4285F4",
    envVars: ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    envVar: "AWS_BEARER_TOKEN_BEDROCK",
    authMode: "api_key",
    icon: FaAmazon,
    brandColor: "FF9900",
    envVars: ["AWS_PROFILE"],
  },
  {
    id: "mistral",
    name: "Mistral",
    envVar: "MISTRAL_API_KEY",
    authMode: "api_key",
    icon: SiMistralai,
    brandColor: "FA520F",
  },
  {
    id: "groq",
    name: "Groq",
    envVar: "GROQ_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/groq.svg",
    monochrome: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    envVar: "CEREBRAS_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/cerebras.svg",
  },
  {
    id: "cloudflare-ai-gateway",
    name: "Cloudflare AI Gateway",
    envVar: "CLOUDFLARE_API_KEY",
    authMode: "api_key",
    icon: SiCloudflare,
    brandColor: "F38020",
    envVars: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_GATEWAY_ID"],
  },
  {
    id: "cloudflare-workers-ai",
    name: "Cloudflare Workers AI",
    envVar: "CLOUDFLARE_API_KEY",
    authMode: "api_key",
    icon: SiCloudflare,
    brandColor: "F38020",
    envVars: ["CLOUDFLARE_ACCOUNT_ID"],
  },
  {
    id: "xai",
    name: "xAI",
    envVar: "XAI_API_KEY",
    authMode: "both",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/xai.svg",
    monochrome: true,
    hasSubscription: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    authMode: "both",
    icon: SiOpenrouter,
    brandColor: "94A3B8",
  },
  {
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    envVar: "AI_GATEWAY_API_KEY",
    authMode: "api_key",
    icon: SiVercel,
    brandColor: "000000",
  },
  {
    id: "zai",
    name: "ZAI Coding Plan (Global)",
    envVar: "ZAI_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/zai.svg",
  },
  {
    id: "zai-coding-cn",
    name: "ZAI Coding Plan (China)",
    envVar: "ZAI_CODING_CN_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/zai.svg",
  },
  {
    id: "opencode",
    name: "OpenCode Zen",
    envVar: "OPENCODE_API_KEY",
    authMode: "api_key",
    icon: SiOpencode,
    brandColor: "000000",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    envVar: "OPENCODE_API_KEY",
    authMode: "api_key",
    icon: SiOpencode,
    brandColor: "000000",
  },
  {
    id: "radius",
    name: "Radius",
    envVar: "RADIUS_API_KEY",
    authMode: "both",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/preset-icons/pi.svg",
    monochrome: true,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    envVar: "HF_TOKEN",
    authMode: "api_key",
    icon: SiHuggingface,
    brandColor: "FFD21E",
  },
  {
    id: "fireworks",
    name: "Fireworks",
    envVar: "FIREWORKS_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/fireworks.svg",
  },
  {
    id: "together",
    name: "Together AI",
    envVar: "TOGETHER_API_KEY",
    authMode: "api_key",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/provider-icons/together.svg",
  },
  {
    id: "kimi-coding",
    name: "Kimi For Coding",
    envVar: "KIMI_API_KEY",
    authMode: "api_key",
    icon: KimiIcon,
    brandColor: "000000",
  },
  {
    id: "minimax",
    name: "MiniMax",
    envVar: "MINIMAX_API_KEY",
    authMode: "api_key",
    icon: SiMinimax,
    brandColor: "E73562",
  },
  {
    id: "minimax-cn",
    name: "MiniMax (China)",
    envVar: "MINIMAX_CN_API_KEY",
    authMode: "api_key",
    icon: SiMinimax,
    brandColor: "E73562",
  },
  {
    id: "moonshotai",
    name: "Moonshot AI",
    envVar: "MOONSHOT_API_KEY",
    authMode: "api_key",
    icon: SiMoonshotai,
    brandColor: "000000",
  },
  {
    id: "moonshotai-cn",
    name: "Moonshot AI (China)",
    envVar: "MOONSHOT_API_KEY",
    authMode: "api_key",
    icon: SiMoonshotai,
    brandColor: "000000",
  },
  {
    id: "qwen-token-plan",
    name: "Qwen Token Plan",
    envVar: "QWEN_TOKEN_PLAN_API_KEY",
    authMode: "api_key",
    icon: SiQwen,
    brandColor: "6950EF",
  },
  {
    id: "qwen-token-plan-cn",
    name: "Qwen Token Plan (China)",
    envVar: "QWEN_TOKEN_PLAN_CN_API_KEY",
    authMode: "api_key",
    icon: SiQwen,
    brandColor: "6950EF",
  },
  {
    id: "xiaomi",
    name: "Xiaomi MiMo",
    envVar: "XIAOMI_API_KEY",
    authMode: "api_key",
    icon: SiXiaomi,
    brandColor: "FF6900",
  },
  {
    id: "xiaomi-token-plan-cn",
    name: "Xiaomi MiMo Token Plan (China)",
    envVar: "XIAOMI_TOKEN_PLAN_CN_API_KEY",
    authMode: "api_key",
    icon: SiXiaomi,
    brandColor: "FF6900",
  },
  {
    id: "xiaomi-token-plan-ams",
    name: "Xiaomi MiMo Token Plan (Amsterdam)",
    envVar: "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
    authMode: "api_key",
    icon: SiXiaomi,
    brandColor: "FF6900",
  },
  {
    id: "xiaomi-token-plan-sgp",
    name: "Xiaomi MiMo Token Plan (Singapore)",
    envVar: "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
    authMode: "api_key",
    icon: SiXiaomi,
    brandColor: "FF6900",
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    authMode: "oauth",
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/preset-icons/codex.svg",
    monochrome: true,
    hasSubscription: true,
    iconScale: 1.5,
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    envVar: "COPILOT_GITHUB_TOKEN",
    authMode: "both",
    icon: SiGithubcopilot,
    brandColor: "000000",
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

export function getPiProviderIcon(providerId: string): IconType {
  return getPiProviderCatalogEntry(providerId)?.icon ?? FALLBACK_PROVIDER_ICON;
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
  const awsProfilesPrefix = "AWS profile: ";
  if (source.startsWith(awsProfilesPrefix)) {
    const firstProfile = source.slice(awsProfilesPrefix.length).split(",")[0]?.trim();
    return firstProfile ? { AWS_PROFILE: firstProfile } : null;
  }
  return null;
}

/**
 * Resolves the icon color for one provider: the official brand hex in light
 * mode, white in dark mode for dark brands (black logos would vanish on dark
 * backgrounds), and undefined (inherit) for fallback icons.
 */
export function getPiProviderIconColor(providerId: string, isDarkMode: boolean): string | undefined {
  const brandColor = getPiProviderCatalogEntry(providerId)?.brandColor;
  if (!brandColor) {
    return undefined;
  }
  if (isDarkMode && isDarkBrandColor(brandColor)) {
    return "#FFFFFF";
  }
  return `#${brandColor}`;
}

/** Approximate relative luminance (0..1) of an `RRGGBB` hex without `#`. */
function isDarkBrandColor(hex: string): boolean {
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return false;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance < 0.25;
}
