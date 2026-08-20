import type { IconType } from "@lobehub/icons";
import type { DesktopAgentKind } from "../providers/agentSettings";
import {
  Claude,
  ClaudeColor,
  Codex,
  CodexColor,
  Cursor,
  Gemini,
  GeminiColor,
  GithubCopilot,
  OpenCode,
  Pi,
} from "./lobeIcons";

/**
 * Agent icon presentation (desktop8 Phase 29).
 *
 * Icons are @lobehub/icons Mono components (24×24 viewBox, `currentColor`),
 * so every kind shares one uniform ratio and scale: dark mode renders the
 * glyph white via the `color` prop, light mode inherits the text color.
 * The kind vocabulary itself stays in `../agentSettings`.
 */

export type AgentIconContext = "tabMenu" | "settingsRow" | "launchGrid";

export type AgentIconPresentation = {
  /** Mono glyph (currentColor) — dark mode and monochrome brands. */
  Icon: IconType;
  /** Brand-color variant — light mode when the brand ships one. */
  ColorIcon?: IconType;
  slotSize: number;
};

export const AGENT_SETTINGS_LABEL_KEY_BY_KIND: Record<DesktopAgentKind, string> = {
  opencode: "settings.agents.items.opencode",
  codex: "settings.agents.items.codex",
  claude: "settings.agents.items.claude",
  gemini: "settings.agents.items.gemini",
  pi: "settings.agents.items.pi",
  copilot: "settings.agents.items.copilot",
  cursor: "settings.agents.items.cursor",
};

export const AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND: Record<DesktopAgentKind, string> = {
  opencode: "tabs.createMenu.opencode",
  codex: "tabs.createMenu.codex",
  claude: "tabs.createMenu.claude",
  gemini: "tabs.createMenu.gemini",
  pi: "tabs.createMenu.pi",
  copilot: "tabs.createMenu.copilot",
  cursor: "tabs.createMenu.cursor",
};

/**
 * The `copilot` agent maps to the GitHub Copilot mark (`GithubCopilot`);
 * the `Copilot` export is Microsoft Copilot's sparkle mark.
 */
const AGENT_ICON_COMPONENT_BY_KIND: Record<DesktopAgentKind, IconType> = {
  opencode: OpenCode,
  codex: Codex,
  claude: Claude,
  gemini: Gemini,
  pi: Pi,
  copilot: GithubCopilot,
  cursor: Cursor,
};

/** Brands with a lobe brand-color variant (all others are monochrome). */
const AGENT_ICON_COLOR_COMPONENT_BY_KIND: Partial<Record<DesktopAgentKind, IconType>> = {
  codex: CodexColor,
  claude: ClaudeColor,
  gemini: GeminiColor,
};

const AGENT_ICON_SLOT_SIZE_BY_CONTEXT: Record<AgentIconContext, number> = {
  tabMenu: 16,
  settingsRow: 16,
  launchGrid: 28,
};

/**
 * Returns centralized agent icon component and sizing presentation for one UI
 * context. Returns `null` when the agent kind or context has no matching
 * configuration.
 */
export function getAgentIconPresentation(
  agentKind: DesktopAgentKind,
  context: AgentIconContext,
): AgentIconPresentation | null {
  const slotSize = AGENT_ICON_SLOT_SIZE_BY_CONTEXT[context];
  const Icon = AGENT_ICON_COMPONENT_BY_KIND[agentKind];
  if (!Icon || !slotSize) {
    console.warn(`[getAgentIconPresentation] Missing icon config for agent "${agentKind}" in context "${context}"`);
    return null;
  }
  return {
    Icon,
    ColorIcon: AGENT_ICON_COLOR_COMPONENT_BY_KIND[agentKind],
    slotSize,
  };
}
