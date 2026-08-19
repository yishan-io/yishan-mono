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

import { KimiIcon } from "./piProviderIcons";

/**
 * Provider visual metadata (desktop8 Phase 29).
 *
 * Presentation counterpart of the authentication catalog in
 * `../piProviders`: brand icons, official colors, and SVG asset hints
 * keyed by provider id. Model stays framework-free; UI consumes this module.
 */

export type PiProviderVisual = {
  icon: IconType;
  /** Official brand color (hex without `#`) from the Simple Icons dataset. */
  brandColor?: string;
  /** Path (relative to the renderer public dir) of an official brand SVG asset. */
  assetIcon?: string;
  /** True when the SVG asset is monochrome and needs a white filter in dark mode. */
  monochrome?: boolean;
  /** Visual scale for assets with padding around the mark (e.g. codex.svg). */
  iconScale?: number;
};

export const FALLBACK_PROVIDER_ICON: IconType = LuCloud;

/**
 * Visual metadata by provider id. Keep ids aligned with
 * `PI_PROVIDER_CATALOG` in `../piProviders`.
 *
 * Icons: react-icons/si (Simple Icons brand marks) + react-icons/fa6 for
 * Amazon/Microsoft, with brandColor values from the Simple Icons v16 dataset;
 * official SVG assets (Wikimedia Commons, same practice as the app's own
 * preset-icons) for OpenAI/Groq/Cerebras/Z.ai and the reused Codex mark.
 * Providers without any brand mark use a neutral LuCloud fallback.
 */
export const PI_PROVIDER_VISUAL_BY_ID: Record<string, PiProviderVisual> = {
  anthropic: { icon: SiAnthropic, brandColor: "191919" },
  "ant-ling": { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/antling.svg", monochrome: true },
  "azure-openai-responses": { icon: FaMicrosoft, brandColor: "0078D4" },
  openai: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/openai.svg", monochrome: true },
  deepseek: { icon: SiDeepseek, brandColor: "5786FE" },
  nvidia: { icon: SiNvidia, brandColor: "76B900" },
  google: { icon: SiGooglegemini, brandColor: "8E75B2" },
  "google-vertex": { icon: SiGooglecloud, brandColor: "4285F4" },
  "amazon-bedrock": { icon: FaAmazon, brandColor: "FF9900" },
  mistral: { icon: SiMistralai, brandColor: "FA520F" },
  groq: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/groq.svg", monochrome: true },
  cerebras: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/cerebras.svg" },
  "cloudflare-ai-gateway": { icon: SiCloudflare, brandColor: "F38020" },
  "cloudflare-workers-ai": { icon: SiCloudflare, brandColor: "F38020" },
  xai: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/xai.svg", monochrome: true },
  openrouter: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/openrouter.svg" },
  "vercel-ai-gateway": { icon: SiVercel, brandColor: "000000" },
  zai: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/zai.svg" },
  "zai-coding-cn": { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/zai.svg" },
  opencode: { icon: SiOpencode, brandColor: "000000" },
  "opencode-go": { icon: SiOpencode, brandColor: "000000" },
  radius: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/preset-icons/pi.svg", monochrome: true },
  huggingface: { icon: SiHuggingface, brandColor: "FFD21E" },
  fireworks: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/fireworks.svg" },
  together: { icon: FALLBACK_PROVIDER_ICON, assetIcon: "app-icons/provider-icons/together.svg" },
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
  "openai-codex": {
    icon: FALLBACK_PROVIDER_ICON,
    assetIcon: "app-icons/preset-icons/codex.svg",
    monochrome: true,
    iconScale: 1.5,
  },
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
 * backgrounds), and undefined (inherit) for fallback icons.
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
