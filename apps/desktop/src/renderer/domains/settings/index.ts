/**
 * Settings feature public API.
 */

export { useCodeTheme } from "./hooks/useCodeTheme";
export { AppThemePreferenceProvider, useThemePreference } from "./hooks/useThemePreference";
export type { AppThemePreference } from "./state/themePreference";

export { editorSettingsStore, type EditorSettingsStoreState } from "./state/editorSettingsStore";
export { displaySettingsStore } from "./state/displaySettingsStore";
export type { AgentChatWidth } from "./state/displaySettingsStore";
export { keybindingSettingsStore, type KeybindingOverrideMap } from "./state/keybindingSettingsStore";

export {
  getDaemonInfo,
  getDaemonLog,
  getDaemonQuitOnExit,
  restartDaemon,
  setDaemonQuitOnExit,
  type DaemonInfoResult,
  type DaemonLogResult,
  type DaemonLogSource,
  type DaemonRestartResult,
} from "./host/daemonHost";
export { listCLIToolStatuses } from "./commands/cliToolCommands";

export { SettingsView } from "./features/settings-shell/SettingsView";
export type { CustomizeFocusItemId } from "./features/settings-shell/settingsSearchCatalog";
