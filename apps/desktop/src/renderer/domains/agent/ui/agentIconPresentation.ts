import type { DesktopAgentKind } from "../providers/agentSettings";

/**
 * Agent icon and label presentation (desktop8 Phase 29).
 *
 * Icon assets, sizing, CSS filters, and settings label keys moved out of the
 * Agent Model into the Agent UI layer. The kind vocabulary itself stays in
 * `../agentSettings`.
 */

export type AgentIconContext = "tabMenu" | "settingsRow" | "launchGrid";
export type AgentIconThemeMode = "light" | "dark";

type AgentIconSizeRatio = {
  width: number;
  height: number;
};

export type AgentIconPresentation = {
  src: string;
  slotSize: number;
  width: number;
  height: number;
  scale: number;
  filterByTheme: Partial<Record<AgentIconThemeMode, string>>;
};

const MONOCHROME_BLACK_FILTER = "brightness(0) saturate(100%)";
const MONOCHROME_WHITE_FILTER = `${MONOCHROME_BLACK_FILTER} invert(1)`;

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

const AGENT_ICON_SRC_BY_KIND: Record<DesktopAgentKind, string> = {
  opencode: "app-icons/preset-icons/opencode.svg",
  codex: "app-icons/preset-icons/codex.svg",
  claude: "app-icons/preset-icons/claude.svg",
  gemini: "app-icons/preset-icons/gemini.svg",
  pi: "app-icons/preset-icons/pi.svg",
  copilot: "material-icons/copilot.svg",
  cursor: "app-icons/preset-icons/cursor.svg",
};

const AGENT_ICON_SLOT_SIZE_BY_CONTEXT: Record<AgentIconContext, number> = {
  tabMenu: 16,
  settingsRow: 16,
  launchGrid: 28,
};

const AGENT_ICON_SIZE_RATIO_BY_KIND: Record<DesktopAgentKind, AgentIconSizeRatio> = {
  opencode: {
    width: 0.75,
    height: 0.875,
  },
  codex: {
    width: 1,
    height: 1,
  },
  claude: {
    width: 1,
    height: 1,
  },
  gemini: {
    width: 1,
    height: 1,
  },
  pi: {
    width: 1,
    height: 1,
  },
  copilot: {
    width: 1,
    height: 1,
  },
  cursor: {
    width: 1,
    height: 1,
  },
};

const AGENT_ICON_SCALE_BY_KIND: Record<DesktopAgentKind, number> = {
  opencode: 1,
  codex: 1.5,
  claude: 1,
  gemini: 1,
  pi: 1,
  copilot: 1.1,
  cursor: 1,
};

const AGENT_ICON_LIGHT_MODE_FILTER_BY_KIND: Partial<Record<DesktopAgentKind, string>> = {
  copilot: MONOCHROME_BLACK_FILTER,
};

/**
 * Returns centralized agent icon asset and sizing presentation for one UI context.
 * Returns `null` when the agent kind or context has no matching configuration.
 */
export function getAgentIconPresentation(
  agentKind: DesktopAgentKind,
  context: AgentIconContext,
): AgentIconPresentation | null {
  const slotSize = AGENT_ICON_SLOT_SIZE_BY_CONTEXT[context];
  const sizeRatio = AGENT_ICON_SIZE_RATIO_BY_KIND[agentKind];
  if (!sizeRatio || !slotSize) {
    console.warn(`[getAgentIconPresentation] Missing icon config for agent "${agentKind}" in context "${context}"`);
    return null;
  }
  const lightModeFilter = AGENT_ICON_LIGHT_MODE_FILTER_BY_KIND[agentKind];
  return {
    src: AGENT_ICON_SRC_BY_KIND[agentKind],
    slotSize,
    width: Math.round(slotSize * sizeRatio.width),
    height: Math.round(slotSize * sizeRatio.height),
    scale: AGENT_ICON_SCALE_BY_KIND[agentKind],
    filterByTheme: {
      dark: MONOCHROME_WHITE_FILTER,
      ...(lightModeFilter ? { light: lightModeFilter } : {}),
    },
  };
}
