/**
 * Settings feature public API (Phase 12, desktop5.md).
 */
export type { SettingsCommands } from "./commands/contract";
export {
  useAgentKindsInUse,
  useKeybindingOverrides,
  useWorkspaceBranchPrefixSettings,
} from "./ui/hooks/useSettingsReadHooks";
export { listSkills } from "./commands/skillCommands";
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
