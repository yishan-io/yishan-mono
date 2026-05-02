export const SUPPORTED_DESKTOP_AGENT_KINDS = [
  "opencode",
  "codex",
  "claude",
  "gemini",
  "pi",
  "copilot",
  "cursor",
] as const;

export type DesktopAgentKind = (typeof SUPPORTED_DESKTOP_AGENT_KINDS)[number];

export type AgentIconContext = "tabMenu" | "settingsRow";
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
  "cursor-agent": "settings.agents.items.cursor",
};

export const AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND: Record<DesktopAgentKind, string> = {
  opencode: "tabs.createMenu.opencode",
  codex: "tabs.createMenu.codex",
  claude: "tabs.createMenu.claude",
  gemini: "tabs.createMenu.gemini",
  pi: "tabs.createMenu.pi",
  copilot: "tabs.createMenu.copilot",
  "cursor-agent": "tabs.createMenu.cursor",
};

const AGENT_ICON_SRC_BY_KIND: Record<DesktopAgentKind, string> = {
  opencode: "app-icons/preset-icons/opencode.svg",
  codex: "app-icons/preset-icons/codex.svg",
  claude: "app-icons/preset-icons/claude.svg",
  gemini: "app-icons/preset-icons/gemini.svg",
  pi: "app-icons/preset-icons/opencode.svg",
  copilot: "material-icons/copilot.svg",
  "cursor-agent": "app-icons/preset-icons/cursor.svg",
};

const AGENT_ICON_SLOT_SIZE_BY_CONTEXT: Record<AgentIconContext, number> = {
  tabMenu: 16,
  settingsRow: 16,
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
  "cursor-agent": {
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
  "cursor-agent": 1,
};

const AGENT_ICON_LIGHT_MODE_FILTER_BY_KIND: Partial<Record<DesktopAgentKind, string>> = {
  copilot: MONOCHROME_BLACK_FILTER,
};

/**
 * Returns centralized agent icon asset and sizing presentation for one UI context.
 */
export function getAgentIconPresentation(
  agentKind: DesktopAgentKind,
  context: AgentIconContext,
): AgentIconPresentation {
  const slotSize = AGENT_ICON_SLOT_SIZE_BY_CONTEXT[context];
  const sizeRatio = AGENT_ICON_SIZE_RATIO_BY_KIND[agentKind];
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

/** Returns true when one string is a supported desktop-agent kind. */
export function isDesktopAgentKind(value: string): value is DesktopAgentKind {
  return SUPPORTED_DESKTOP_AGENT_KINDS.some((agentKind) => agentKind === value);
}

/** Builds one default in-use map for all supported desktop agents. */
export function createDefaultAgentInUseByKind(defaultValue: boolean): Record<DesktopAgentKind, boolean> {
  return SUPPORTED_DESKTOP_AGENT_KINDS.reduce<Record<DesktopAgentKind, boolean>>(
    (nextMap, agentKind) => {
      nextMap[agentKind] = defaultValue;
      return nextMap;
    },
    {} as Record<DesktopAgentKind, boolean>,
  );
}
