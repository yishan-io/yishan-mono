import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import type { TerminalWriteQueue } from "./terminalWriteQueue";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Runtime state machine for a terminal tab.
 *
 * Allowed transitions:
 *   idle -> attaching -> attached -> detached -> disposing -> disposed
 *   idle -> disposing -> disposed
 *   attaching -> detached -> ...
 *   attached -> disposing -> disposed
 *   detached -> attaching -> attached
 *   detached -> disposing -> disposed
 *
 * All other transitions are no-ops.
 */
export type TerminalRuntimeState = "idle" | "attaching" | "attached" | "detached" | "disposing" | "disposed";

export type TerminalRuntimeEntry = {
  tabId: string;
  state: TerminalRuntimeState;
  /** Monotonically increasing version — used to reject stale async completions. */
  version: number;
  /** The xterm Terminal instance (created once, never recreated). */
  terminal: Terminal;
  /** xterm host element that terminal renders into. */
  hostElement: HTMLDivElement;
  /** FitAddon reference for resize operations. */
  fitAddon: FitAddon;
  /** SearchAddon reference for search UI. */
  searchAddon: SearchAddon;
  /** Frame-batched write queue for PTY output. */
  writeQueue: TerminalWriteQueue;
  /** The active session id for this terminal (if attached to a PTY session). */
  sessionId: string | null;
  /** Output subscription handle — stays alive across attach/detach. */
  outputSubscription: { unsubscribe: () => void } | null;
  /** Next read index for deduplication of output chunks. */
  readIndex: number;
  /** Whether the user/component already requested close for this tab. */
  didRequestClose: boolean;
  /** ResizeObserver for the host element (disconnected on detach). */
  resizeObserver: ResizeObserver | null;
  /** One-shot MutationObserver waiting for xterm textarea mount. */
  focusObserver: MutationObserver | null;
  /** Whether the terminal session has exited (for close-on-reattach logic). */
  exited: boolean;
  /** Last terminal dimensions sent to PTY resize handler. */
  lastReportedCols: number;
  lastReportedRows: number;
  /** Timestamp of last successful fit call for throttling. */
  lastFitAt: number;
  /** Whether focus should be applied once runtime is attached and interactive. */
  pendingFocus: boolean;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

export const TERMINAL_OPTIONS = {
  cursorBlink: true,
  convertEol: true,
  allowProposedApi: true,
  fontFamily: '"MesloLGS NF", "JetBrains Mono", "SF Mono", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.4,
  scrollback: 2_000,
  smoothScrollDuration: 0,
  scrollSensitivity: 1,
  fastScrollSensitivity: 5,
  rescaleOverlappingGlyphs: true,
  theme: {
    background: "#2b3038",
    foreground: "#e7ebf0",
  },
} as const;

/** Resize debounce interval in milliseconds. */
export const RESIZE_DEBOUNCE_MS = 50;
export const MIN_HOST_SIZE_DELTA_PX = 1;
export const MIN_FIT_INTERVAL_MS = 80;

// ─── State Machine Helpers ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TerminalRuntimeState, Set<TerminalRuntimeState>> = {
  idle: new Set(["attaching", "disposing"]),
  attaching: new Set(["attached", "detached", "disposing"]),
  attached: new Set(["detached", "disposing"]),
  detached: new Set(["attaching", "disposing"]),
  disposing: new Set(["disposed"]),
  disposed: new Set(),
};

/** Returns true when the given state transition is valid. */
export function canTransition(from: TerminalRuntimeState, to: TerminalRuntimeState): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

/** Applies a state transition if valid. Returns true on success. */
export function transitionState(entry: TerminalRuntimeEntry, to: TerminalRuntimeState): boolean {
  if (!canTransition(entry.state, to)) {
    return false;
  }
  entry.state = to;
  entry.version += 1;
  return true;
}
