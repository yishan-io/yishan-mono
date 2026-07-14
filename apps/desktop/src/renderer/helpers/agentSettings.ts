import { AGENT_KINDS } from "@yishan-io/core";
import type { PiRuntimeModelRecord } from "../../main/piRuntime/piRuntimeTypes";

/**
 * The canonical agent kind list for this desktop app.
 * Values come from `@yishan-io/core` — do not duplicate inline.
 */
export const SUPPORTED_DESKTOP_AGENT_KINDS = AGENT_KINDS;

export type DesktopAgentKind = (typeof SUPPORTED_DESKTOP_AGENT_KINDS)[number];

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

/**
 * The system-default CLI command name for each agent kind.
 * These are the fallback values used when no user-defined custom command is set.
 */
export const DEFAULT_AGENT_COMMANDS: Record<DesktopAgentKind, string> = {
  opencode: "opencode",
  codex: "codex",
  claude: "claude",
  gemini: "gemini",
  pi: "pi",
  copilot: "copilot",
  cursor: "cursor",
};

/** Maximum character length enforced on a user-supplied agent command string. */
export const AGENT_COMMAND_MAX_LENGTH = 2048;

/** Maximum character length persisted for the Yishan-owned default Pi model pattern. */
export const PI_MODEL_PATTERN_MAX_LENGTH = 512;

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

/**
 * Builds a partial map initialised with no custom commands (all `undefined`).
 * Persisted as a `Partial` record — absent keys mean "use the system default".
 */
export function createDefaultCustomCommandByKind(): Partial<Record<DesktopAgentKind, string>> {
  return {};
}

/**
 * Resolves the effective launch command for one agent kind.
 * Returns the user-supplied override when present, otherwise falls back to the system default.
 */
export function resolveAgentLaunchCommand(
  agentKind: DesktopAgentKind,
  customCommands: Partial<Record<DesktopAgentKind, string>>,
): string {
  return customCommands[agentKind] ?? DEFAULT_AGENT_COMMANDS[agentKind];
}

/**
 * Validates a user-supplied custom command string.
 * Returns an i18n error key when invalid, or `null` when the value is acceptable.
 */
export function validateAgentCommand(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "settings.agents.command.errorEmpty";
  }
  if (trimmed.length > AGENT_COMMAND_MAX_LENGTH) {
    return "settings.agents.command.errorTooLong";
  }
  return null;
}

/** Normalizes the persisted default Pi model pattern, dropping empty or oversized values. */
export function normalizePiModelPattern(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > PI_MODEL_PATTERN_MAX_LENGTH) {
    return undefined;
  }
  return trimmed;
}

/** Extracts a provider ID from one normalized `provider/model` pattern. */
export function getPiProviderIdFromModelPattern(pattern: string | undefined): string | undefined {
  const normalizedPattern = normalizePiModelPattern(pattern);
  const separatorIndex = normalizedPattern?.indexOf("/") ?? -1;
  return separatorIndex > 0 ? normalizedPattern?.slice(0, separatorIndex) : undefined;
}

/** Returns true when one saved Pi model pattern still identifies an available model. */
export function isPiModelPatternAvailable(
  models: readonly PiRuntimeModelRecord[],
  pattern: string | undefined,
): boolean {
  if (!pattern) {
    return false;
  }
  return models.some((model) => model.available && `${model.providerId}/${model.modelId}` === pattern);
}
