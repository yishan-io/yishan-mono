/**
 * Terminal feature public API (Phase 12, desktop5.md).
 */
export type { TerminalCommands } from "./commands/contract";
// Leaf command + read-surface exports first: cross-domain imports (e.g. the
// agent pi provider commands) re-enter this index while the Runtime section
// below is still evaluating, so the leaf bindings must already be available.
export { getTerminalResourceUsage } from "./commands/terminalCommands";
export type { TerminalResourceUsageSnapshot } from "./commands/terminalCommands";
export {
  closeTerminalSession,
  consumeTerminalTabFocus,
  createTerminalSession,
  killTerminalProcess,
  listDetectedPorts,
  listTerminalSessions,
  readTerminalOutput,
  resizeTerminal,
  retainOpenTerminalTabFocus,
  setActiveWorkspace,
  subscribeDetectedPorts,
  subscribeTerminalOutput,
  subscribeTerminalSessions,
  writeTerminalInput,
} from "./commands/terminalCommands";
export type { TerminalDetectedPort, TerminalSessionSummary } from "./commands/terminalCommands";
export { useSharedTerminalResourceUsageSnapshot } from "./hooks/useSharedTerminalResourceUsageSnapshot";
export { useTerminalTabLookups } from "./hooks/useTerminalTabLookups";
// Terminal Runtime entry points required by cross-feature composition. These
// are function entry points into the Terminal Runtime; the Runtime instance
// itself stays internal (Phase 17, desktop6.md).
export {
  attachTerminalRuntime,
  detachTerminalRuntime,
  disposeTerminalRuntimesForClosedTabs,
  ensureTerminalRuntime,
  forceFitTerminalRuntimes,
  getTerminalRuntime,
  recoverAttachedTerminalRuntime,
  requestTerminalRuntimeFocus,
} from "./runtime/terminalRuntimeRegistry";
export { initTerminalSessionLifecycle } from "./runtime/terminalSessionService";
export { TerminalRecoveryCoordinator } from "./runtime/terminalRecovery";

// Stable UI entry points for cross-feature composition (Phase 18).
export { TerminalView } from "./features/terminal-tab/TerminalView";
export { createTerminalEventHandlers } from "./events/terminalEventHandlers";
