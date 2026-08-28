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
  SiQwen,
  SiVercel,
  SiXiaomi,
} from "react-icons/si";

import {
  AntGroup,
  AntGroupColor,
  Cerebras,
  CerebrasColor,
  Codex,
  CodexColor,
  Fireworks,
  FireworksColor,
  Groq,
  OpenAI,
  OpenRouter,
  OpenRouterColor,
  Pi,
  Together,
  TogetherColor,
  XAI,
  ZAI,
} from "./lobeIcons";

import { KimiIcon } from "./piProviderIcons";

/**
 * Provider visual metadata (desktop8 Phase 29).
 *
 * Presentation counterpart of the authentication catalog in
 * `../piProviders`: brand icons and official colors keyed by provider id.
 * Model stays framework-free; UI consumes this module.
 *
 * Icons: @lobehub/icons Mono components (24×24 viewBox, `currentColor`) for
 * the providers that previously shipped SVG assets (OpenAI/Groq/Cerebras/
 * Z.ai etc. and the reused Codex/Pi marks), react-icons/si (Simple Icons)
 * + react-icons/fa6 for Amazon/Microsoft, with brandColor values from the
 * Simple Icons v16 dataset. Providers without a brand mark use a neutral
 * LuCloud fallback.
 */

export type PiProviderVisual = {
  /** Mono glyph or react-icon mark — dark mode and monochrome brands. */
  icon: IconType;
  /** Brand-color variant — light mode when the brand ships one. */
  ColorIcon?: IconType;
  /** Official brand color (hex without `#`) from the Simple Icons dataset. */
  brandColor?: string;
};

export const FALLBACK_PROVIDER_ICON: IconType = LuCloud;

/**
 * Visual metadata by provider id. Keep ids aligned with
 * `PI_PROVIDER_CATALOG` in `../piProviders`.
 */
export const PI_PROVIDER_VISUAL_BY_ID: Record<string, PiProviderVisual> = {
  anthropic: { icon: SiAnthropic, brandColor: "191919" },
  // Ant Group's Ant Ling model — same mark as the Ant Group brand logo.
  "ant-ling": { icon: AntGroup, ColorIcon: AntGroupColor },
  "azure-openai-responses": { icon: FaMicrosoft, brandColor: "0078D4" },
  openai: { icon: OpenAI },
  deepseek: { icon: SiDeepseek, brandColor: "5786FE" },
  "deepseek-official": { icon: SiDeepseek, brandColor: "5786FE" },
  nvidia: { icon: SiNvidia, brandColor: "76B900" },
  google: { icon: SiGooglegemini, brandColor: "8E75B2" },
  "google-vertex": { icon: SiGooglecloud, brandColor: "4285F4" },
  "amazon-bedrock": { icon: FaAmazon, brandColor: "FF9900" },
  mistral: { icon: SiMistralai, brandColor: "FA520F" },
  groq: { icon: Groq },
  cerebras: { icon: Cerebras, ColorIcon: CerebrasColor },
  "cloudflare-ai-gateway": { icon: SiCloudflare, brandColor: "F38020" },
  "cloudflare-workers-ai": { icon: SiCloudflare, brandColor: "F38020" },
  xai: { icon: XAI },
  openrouter: { icon: OpenRouter, ColorIcon: OpenRouterColor },
  "vercel-ai-gateway": { icon: SiVercel, brandColor: "000000" },
  zai: { icon: ZAI },
  "zai-coding-cn": { icon: ZAI },
  opencode: { icon: SiOpencode, brandColor: "000000" },
  "opencode-go": { icon: SiOpencode, brandColor: "000000" },
  radius: { icon: Pi },
  huggingface: { icon: SiHuggingface, brandColor: "FFD21E" },
  fireworks: { icon: Fireworks, ColorIcon: FireworksColor },
  together: { icon: Together, ColorIcon: TogetherColor },
  "kimi-coding": { icon: KimiIcon, brandColor: "000000" },
  minimax: { icon: SiMinimax, brandColor: "E73562" },
  "minimax-cn": { icon: SiMinimax, brandColor: "E73562" },
  moonshotai: { icon: SiMoonshotai, brandColor: "000000" },
  "moonshotai-cn": { icon: SiMoonshotai, brandColor: "000000" },
  "qwen-token-plan": { icon: SiQwen, brandColor: "6950EF" },
  "qwen-token-plan-cn": { icon: SiQwen, brandColor: "6950EF" },
  xiaomi: { icon: SiXiaomi, brandColor: "FF6900" },
  "xiaomi-token-plan-cn": { icon: SiXiaomi, brandColor: "FF6900" },
  "xiaomi-token-plan-ams": { icon: SiXiaomi, brandColor: "FF6900" },
  "xiaomi-token-plan-sgp": { icon: SiXiaomi, brandColor: "FF6900" },
  "openai-codex": { icon: Codex, ColorIcon: CodexColor },
  "github-copilot": { icon: SiGithubcopilot, brandColor: "000000" },
};

export function getPiProviderVisual(providerId: string): PiProviderVisual | undefined {
  return PI_PROVIDER_VISUAL_BY_ID[providerId];
}

export function getPiProviderIcon(providerId: string): IconType {
  return getPiProviderVisual(providerId)?.icon ?? FALLBACK_PROVIDER_ICON;
}

/**
 * Resolves the icon color for one provider: the official brand hex in light
 * mode, white in dark mode for dark brands (black logos would vanish on dark
 * backgrounds), and undefined (inherit) for providers without a brand color.
 */
export function getPiProviderIconColor(providerId: string, isDarkMode: boolean): string | undefined {
  const brandColor = getPiProviderVisual(providerId)?.brandColor;
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
