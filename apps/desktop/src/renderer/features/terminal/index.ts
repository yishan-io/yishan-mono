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

// Stable UI entry points for cross-feature composition (Phase 18).
export { TerminalView } from "./ui/TerminalView";
