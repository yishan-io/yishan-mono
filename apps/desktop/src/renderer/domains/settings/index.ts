/**
 * Settings feature public API (Phase 12, desktop5.md).
 */
export { useKeybindingOverrides } from "./hooks/useSettingsReadHooks";
export { useCodeTheme } from "./hooks/useCodeTheme";
export { AppThemePreferenceProvider, useThemePreference } from "./hooks/useThemePreference";

export {
  SettingsErrorBoundary,
  SettingsPageLayout,
  type SettingsErrorBoundaryProps,
  type SettingsPageLayoutProps,
} from "./ui/controls";
export {
  editorSettingsStore,
  type EditorSettingsStoreState,
} from "./state/editorSettingsStore";
export { displaySettingsStore } from "./state/displaySettingsStore";
export { keybindingSettingsStore, type KeybindingOverrideMap } from "./state/keybindingSettingsStore";

export {
  getDaemonInfo,
  getDaemonLog,
  getDaemonQuitOnExit,
  restartDaemon,
  setDaemonQuitOnExit,
  type DaemonInfoResult,
  type DaemonLogResult,
  type DaemonRestartResult,
} from "./daemon/daemonHostCommands";
export { listCLIToolStatuses } from "./commands/cliToolCommands";

export { SettingsView } from "./features/settings-shell/SettingsView";
export type { CustomizeFocusItemId } from "./features/settings-shell/settingsSearchCatalog";
export { HotkeyDisplay, KeybindingTable } from "./features/keybindings/KeybindingDisplay";
