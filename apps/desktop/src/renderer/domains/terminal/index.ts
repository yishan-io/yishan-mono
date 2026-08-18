/**
 * Terminal feature public API (Phase 12, desktop5.md).
 */
export type { TerminalCommands } from "./commands/contract";
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
export { getTerminalResourceUsage } from "./commands/terminalCommands";
export type { TerminalResourceUsageSnapshot } from "./commands/terminalCommands";
export { useSharedTerminalResourceUsageSnapshot } from "./ui/hooks/useSharedTerminalResourceUsageSnapshot";
export { useTerminalTabLookups } from "./ui/hooks/useTerminalTabLookups";

// Stable UI entry points for cross-feature composition (Phase 18).
export { TerminalView } from "./ui/TerminalView";
