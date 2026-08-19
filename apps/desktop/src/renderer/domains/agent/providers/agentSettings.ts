import { AGENT_KINDS } from "@yishan-io/core";

/**
 * The canonical agent kind list for this desktop app.
 * Values come from `@yishan-io/core` — do not duplicate inline.
 */
export const SUPPORTED_DESKTOP_AGENT_KINDS = AGENT_KINDS;

export type DesktopAgentKind = (typeof SUPPORTED_DESKTOP_AGENT_KINDS)[number];

/**
 * The system-default launch command for each agent kind.
 * Custom launch commands are no longer supported; these are always used.
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

/** Returns true when one string is a supported desktop-agent kind. */
export function isDesktopAgentKind(value: string): value is DesktopAgentKind {
  return SUPPORTED_DESKTOP_AGENT_KINDS.some((agentKind) => agentKind === value);
}

/**
 * Agent kinds that have a dedicated section on the CLI settings page and are
 * therefore hidden from the generic agents list there.
 */
export const AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION = new Set<DesktopAgentKind>(["pi"]);

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
