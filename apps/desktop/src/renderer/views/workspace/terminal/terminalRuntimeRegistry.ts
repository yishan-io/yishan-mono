import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import { createFixedRuntimeLayer } from "../runtime/runtimeSurfaceLayer";
import { loadTerminalAddons } from "./terminalAddons";
import { createTerminalWriteQueue } from "./terminalWriteQueue";
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
export type TerminalRuntimeState =
  | "idle"
  | "attaching"
  | "attached"
  | "detached"
  | "disposing"
  | "disposed";

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
  /** Whether the terminal session has exited (for close-on-reattach logic). */
  exited: boolean;
  /** Last terminal dimensions sent to PTY resize handler. */
  lastReportedCols: number;
  lastReportedRows: number;
  /** Timestamp of last successful fit call for throttling. */
  lastFitAt: number;
};

// ─── Resize Callback ───────────────────────────────────────────────────────────

/**
 * External resize handler — set by the session service to propagate resize to PTY.
 * This avoids a circular import between registry and session service.
 */
let onTerminalResized: ((tabId: string) => void) | null = null;

export function setTerminalResizeHandler(handler: (tabId: string) => void): void {
  onTerminalResized = handler;
}

/**
 * External dispose handler — set by the session service to clean up its tracking maps.
 */
let onTerminalDisposed: ((tabId: string) => void) | null = null;

export function setTerminalDisposeHandler(handler: (tabId: string) => void): void {
  onTerminalDisposed = handler;
}

/**
 * External handler called when a previously-detached terminal is reattached.
 * The session service uses this to check exit state and close the tab if needed.
 */
let onTerminalReattached: ((tabId: string) => void) | null = null;

export function setTerminalReattachHandler(handler: (tabId: string) => void): void {
  onTerminalReattached = handler;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL_OPTIONS = {
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
    background: "#292e36",
    foreground: "#e7ebf0",
  },
} as const;

/** Resize debounce interval in milliseconds. */
const RESIZE_DEBOUNCE_MS = 50;
const MIN_HOST_SIZE_DELTA_PX = 1;
const MIN_FIT_INTERVAL_MS = 80;

// ─── Module State ──────────────────────────────────────────────────────────────

const runtimesByTabId = new Map<string, TerminalRuntimeEntry>();
const runtimeLayer = createFixedRuntimeLayer("terminal-root-host");

// ─── State Machine Helpers ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TerminalRuntimeState, Set<TerminalRuntimeState>> = {
  idle: new Set(["attaching", "disposing"]),
  attaching: new Set(["attached", "detached", "disposing"]),
  attached: new Set(["detached", "disposing"]),
  detached: new Set(["attaching", "disposing"]),
  disposing: new Set(["disposed"]),
  disposed: new Set(),
};

function canTransition(from: TerminalRuntimeState, to: TerminalRuntimeState): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

function transitionState(entry: TerminalRuntimeEntry, to: TerminalRuntimeState): boolean {
  if (!canTransition(entry.state, to)) {
    return false;
  }
  entry.state = to;
  entry.version += 1;
  return true;
}

// ─── Core Registry APIs ────────────────────────────────────────────────────────

/**
 * Returns an existing runtime entry or creates a new one in `idle` state.
 * The xterm Terminal instance is created immediately but not attached to any
 * visible placeholder yet — it renders into an offscreen host element managed
 * by the runtime layer.
 */
export function ensureTerminalRuntime(tabId: string): TerminalRuntimeEntry {
  const existing = runtimesByTabId.get(tabId);
  if (existing && existing.state !== "disposed") {
    return existing;
  }

  // Create the host element that xterm will render into.
  const hostElement = document.createElement("div");
  hostElement.style.position = "fixed";
  hostElement.style.left = "0";
  hostElement.style.top = "0";
  hostElement.style.width = "0";
  hostElement.style.height = "0";
  hostElement.style.overflow = "hidden";
  hostElement.style.visibility = "hidden";
  hostElement.style.pointerEvents = "none";
  hostElement.style.zIndex = "1";
  hostElement.setAttribute("data-terminal-tab-id", tabId);

  // Suppress xterm's internal viewport scrollbar to prevent double-scrollbar UX.
  // Injected once globally using the data attribute as a selector.
  ensureXtermViewportStyle();

  // Register in the runtime layer FIRST so the host is in the DOM tree
  // before xterm initializes its canvas and WebGL renderer.
  runtimeLayer.register(tabId, hostElement);

  // Create xterm instance and open it into the host (now connected to DOM).
  const terminal = new Terminal(TERMINAL_OPTIONS);
  terminal.open(hostElement);
  const { fitAddon, searchAddon } = loadTerminalAddons(terminal);
  const writeQueue = createTerminalWriteQueue(terminal);

  const entry: TerminalRuntimeEntry = {
    tabId,
    state: "idle",
    version: 0,
    terminal,
    hostElement,
    fitAddon,
    searchAddon,
    writeQueue,
    sessionId: null,
    outputSubscription: null,
    readIndex: 0,
    didRequestClose: false,
    resizeObserver: null,
    exited: false,
    lastReportedCols: -1,
    lastReportedRows: -1,
    lastFitAt: 0,
  };

  runtimesByTabId.set(tabId, entry);
  return entry;
}

/**
 * Attaches a terminal runtime to a visible placeholder element.
 * The runtime layer positions the host element to overlay the placeholder
 * using a ResizeObserver. Performs one definitive fit -> resize sync on attach.
 *
 * Returns the captured version so callers can verify async completions are still valid.
 */
export function attachTerminalRuntime(tabId: string, placeholder: HTMLElement): number {
  const entry = runtimesByTabId.get(tabId);
  if (!entry) {
    return -1;
  }

  const wasDetached = entry.state === "detached";

  // Allow idle -> attaching, or detached -> attaching
  if (entry.state === "idle" || entry.state === "detached") {
    transitionState(entry, "attaching");
  } else if (entry.state === "attaching" || entry.state === "attached") {
    // Already attaching/attached — just re-sync the placeholder positioning.
    runtimeLayer.attach(tabId, placeholder);
    safeFitTerminal(entry, true);
    return entry.version;
  } else {
    return -1;
  }

  const version = entry.version;

  // Unpark: remove inert/aria-hidden and restore interaction attributes set by parkTerminalHost.
  unparkTerminalHost(entry);

  // Position the host element to overlay the placeholder.
  runtimeLayer.attach(tabId, placeholder);

  // Mark as attached.
  transitionState(entry, "attached");

  // Resume per-frame write batching for visual smoothness.
  entry.writeQueue.setDetached(false);

  // Set up resize observer for the host element.
  setupResizeObserver(entry);

  // Perform one definitive fit on attach when host has non-zero area.
  const didFitOnAttach = safeFitTerminal(entry, true);

  // Notify resize handler so PTY gets the new dimensions after fit.
  notifyTerminalResizeIfNeeded(entry, didFitOnAttach);

  // If this was a reattach from detached state, check for pending exit.
  if (wasDetached) {
    onTerminalReattached?.(tabId);
  }

  return version;
}

/**
 * Detaches a terminal runtime from its visible placeholder.
 * The terminal stays alive in the offscreen parking area.
 * ResizeObserver is disconnected to avoid unnecessary work.
 */
export function detachTerminalRuntime(tabId: string, placeholder: HTMLElement): void {
  const entry = runtimesByTabId.get(tabId);
  if (!entry) {
    return;
  }

  if (entry.state !== "attached" && entry.state !== "attaching") {
    return;
  }

  // Disconnect resize observer.
  disconnectResizeObserver(entry);

  // Detach from runtime layer (hides the host).
  runtimeLayer.detach(tabId, placeholder);

  // Park the host element offscreen.
  parkTerminalHost(entry);

  transitionState(entry, "detached");

  // Switch to longer write batching interval to reduce main-thread contention
  // with the visible terminal's per-frame rendering.
  entry.writeQueue.setDetached(true);
}

/**
 * Disposes a terminal runtime completely — destroys xterm, unsubscribes output,
 * removes from runtime layer and registry map.
 */
export function disposeTerminalRuntime(tabId: string): void {
  const entry = runtimesByTabId.get(tabId);
  if (!entry || entry.state === "disposed") {
    return;
  }

  if (!canTransition(entry.state, "disposing")) {
    // Force dispose even from unexpected states for cleanup safety.
    entry.state = "disposing";
  } else {
    transitionState(entry, "disposing");
  }

  // Cleanup in order.
  disconnectResizeObserver(entry);
  entry.outputSubscription?.unsubscribe();
  entry.outputSubscription = null;
  entry.writeQueue.dispose();
  entry.terminal.dispose();

  runtimeLayer.remove(tabId);
  runtimesByTabId.delete(tabId);

  entry.state = "disposed";

  // Notify session service to clean up its tracking.
  onTerminalDisposed?.(tabId);
}

/**
 * Disposes runtime entries for tabs that are no longer open.
 * Analogous to `removeWebviewsForClosedTabs`.
 */
export function disposeTerminalRuntimesForClosedTabs(openTabIds: ReadonlySet<string>): void {
  // Snapshot keys first to avoid issues if callbacks mutate the map.
  for (const tabId of Array.from(runtimesByTabId.keys())) {
    if (!openTabIds.has(tabId)) {
      disposeTerminalRuntime(tabId);
    }
  }
}

/**
 * Gets an existing runtime entry (or null if not yet created/already disposed).
 */
export function getTerminalRuntime(tabId: string): TerminalRuntimeEntry | null {
  return runtimesByTabId.get(tabId) ?? null;
}

/**
 * Returns true if the terminal runtime is currently attached and visible.
 */
export function isTerminalRuntimeAttached(tabId: string): boolean {
  const entry = runtimesByTabId.get(tabId);
  return entry?.state === "attached";
}

// ─── Session Lifecycle Integration ─────────────────────────────────────────────

/**
 * Stores the session id on the runtime entry after session resolution.
 * Safe to call after dispose — silently no-ops if entry is gone.
 */
export function setTerminalSessionId(tabId: string, sessionId: string): void {
  const entry = runtimesByTabId.get(tabId);
  if (entry) {
    entry.sessionId = sessionId;
  }
}

/**
 * Stores the output subscription handle on the runtime entry.
 * The subscription stays alive across attach/detach cycles.
 * Safe to call after dispose — silently no-ops if entry is gone.
 */
export function setTerminalOutputSubscription(tabId: string, subscription: { unsubscribe: () => void }): void {
  const entry = runtimesByTabId.get(tabId);
  if (entry) {
    // Unsubscribe any previous subscription before replacing.
    entry.outputSubscription?.unsubscribe();
    entry.outputSubscription = subscription;
  }
}

/**
 * Updates the read index for output deduplication.
 * Safe to call after dispose — silently no-ops if entry is gone.
 */
export function updateTerminalReadIndex(tabId: string, nextIndex: number): void {
  const entry = runtimesByTabId.get(tabId);
  if (entry && nextIndex > entry.readIndex) {
    entry.readIndex = nextIndex;
  }
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

function parkTerminalHost(entry: TerminalRuntimeEntry): void {
  entry.hostElement.style.visibility = "hidden";
  entry.hostElement.style.left = "-10000px";
  entry.hostElement.style.top = "-10000px";
  entry.hostElement.style.width = "0";
  entry.hostElement.style.height = "0";
  entry.hostElement.style.pointerEvents = "none";
  entry.hostElement.setAttribute("aria-hidden", "true");
  // inert prevents all user interaction — must be removed on reattach.
  entry.hostElement.setAttribute("inert", "");
}

function unparkTerminalHost(entry: TerminalRuntimeEntry): void {
  entry.hostElement.removeAttribute("aria-hidden");
  entry.hostElement.removeAttribute("inert");
  // visibility and pointer-events are restored by runtimeLayer.attach()
  // which sets them based on the placeholder rect.
}

function setupResizeObserver(entry: TerminalRuntimeEntry): void {
  disconnectResizeObserver(entry);

  let resizeTimerId: ReturnType<typeof setTimeout> | null = null;
  let lastWidth = -1;
  let lastHeight = -1;
  const observer = new ResizeObserver(() => {
    if (entry.state !== "attached") {
      return;
    }

    if (resizeTimerId !== null) {
      clearTimeout(resizeTimerId);
    }
    resizeTimerId = setTimeout(() => {
      resizeTimerId = null;
      if (entry.state !== "attached") {
        return;
      }

      const rect = entry.hostElement.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (
        lastWidth >= 0 &&
        lastHeight >= 0 &&
        Math.abs(width - lastWidth) < MIN_HOST_SIZE_DELTA_PX &&
        Math.abs(height - lastHeight) < MIN_HOST_SIZE_DELTA_PX
      ) {
        return;
      }

      lastWidth = width;
      lastHeight = height;
      const didFit = safeFitTerminal(entry);
      notifyTerminalResizeIfNeeded(entry, didFit);
    }, RESIZE_DEBOUNCE_MS);
  });

  observer.observe(entry.hostElement);
  entry.resizeObserver = observer;
}

function disconnectResizeObserver(entry: TerminalRuntimeEntry): void {
  entry.resizeObserver?.disconnect();
  entry.resizeObserver = null;
}

function safeFitTerminal(entry: TerminalRuntimeEntry, force = false): boolean {
  if (entry.state !== "attached" && entry.state !== "attaching") {
    return false;
  }

  if (!force && Date.now() - entry.lastFitAt < MIN_FIT_INTERVAL_MS) {
    return false;
  }

  const rect = entry.hostElement.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) {
    return false;
  }

  try {
    entry.fitAddon.fit();
    entry.lastFitAt = Date.now();
    return true;
  } catch (error) {
    console.error("[TerminalRegistry] Failed to fit terminal", error);
    return false;
  }
}

function notifyTerminalResizeIfNeeded(entry: TerminalRuntimeEntry, didFit: boolean): void {
  if (!didFit) {
    return;
  }

  const nextCols = entry.terminal.cols;
  const nextRows = entry.terminal.rows;
  if (entry.lastReportedCols === nextCols && entry.lastReportedRows === nextRows) {
    return;
  }

  entry.lastReportedCols = nextCols;
  entry.lastReportedRows = nextRows;
  onTerminalResized?.(entry.tabId);
}

/** Reports one terminal async error without breaking render lifecycle. */
export function reportTerminalAsyncError(action: string, error: unknown): void {
  console.error(`[TerminalRegistry] Failed to ${action}`, error);
}

/** Test-only helper: clears all runtime entries between unit tests. */
export function __resetTerminalRuntimeRegistryForTests(): void {
  for (const tabId of Array.from(runtimesByTabId.keys())) {
    disposeTerminalRuntime(tabId);
  }
}

const XTERM_VIEWPORT_STYLE_ID = "yishan-xterm-viewport-style";

function ensureXtermViewportStyle(): void {
  if (document.getElementById(XTERM_VIEWPORT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = XTERM_VIEWPORT_STYLE_ID;
  style.textContent = [
    `[data-terminal-tab-id] .xterm-viewport {`,
    `  overflow-y: scroll !important;`,
    `  scrollbar-width: none !important;`,
    `}`,
    `[data-terminal-tab-id] .xterm-viewport::-webkit-scrollbar {`,
    `  display: none !important;`,
    `}`,
  ].join("\n");
  document.head.appendChild(style);
}
