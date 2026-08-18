/**
 * Settings feature public API (Phase 12, desktop5.md).
 */
export type { SettingsCommands } from "./commands/contract";
export {
  useKeybindingOverrides,
  useWorkspaceBranchPrefixSettings,
} from "./hooks/useSettingsReadHooks";
export { useCodeTheme } from "./hooks/useCodeTheme";
export { AppThemePreferenceProvider, useThemePreference } from "./hooks/useThemePreference";
export {
  type GitBranchPrefixMode,
  resolveGitBranchPrefix,
} from "./model/branchPrefix";
export * from "./ui/controls";
export {
  editorSettingsStore,
  type EditorSettingsStoreState,
} from "./state/editorSettingsStore";
export { displaySettingsStore } from "./state/displaySettingsStore";
export { keybindingSettingsStore, type KeybindingOverrideMap } from "./state/keybindingSettingsStore";
export { selectIsDefaultContextEnabled } from "./state/settingsSelectors";

export {
  getDaemonInfo,
  getDaemonLog,
  getDaemonQuitOnExit,
  restartDaemon,
  setDaemonQuitOnExit,
  type DaemonInfoResult,
  type DaemonLogResult,
  type DaemonRestartResult,
} from "./infrastructure/daemonHostCommands";
export { listCLIToolStatuses } from "./commands/cliToolCommands";

export { SettingsView } from "./features/settings-shell/SettingsView";
export type { CustomizeFocusItemId } from "./features/settings-shell/settingsSearchCatalog";
