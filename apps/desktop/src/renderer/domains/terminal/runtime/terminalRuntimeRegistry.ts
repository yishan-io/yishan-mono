import { createFixedRuntimeLayer } from "@renderer/domains/workbench";
import { Terminal } from "@xterm/xterm";
import { loadTerminalAddons } from "./terminalAddons";
import {
  MIN_FIT_INTERVAL_MS,
  MIN_HOST_SIZE_DELTA_PX,
  RESIZE_DEBOUNCE_MS,
  TERMINAL_OPTIONS,
  type TerminalRuntimeEntry,
  type TerminalRuntimeState,
  type TerminalTabData,
  canTransition,
  transitionState,
} from "./terminalRuntimeTypes";
import { createTerminalWriteQueue } from "./terminalWriteQueue";
import type { TerminalWriteQueue } from "./terminalWriteQueue";

export type { TerminalRuntimeEntry, TerminalRuntimeState, TerminalTabData } from "./terminalRuntimeTypes";
export { reportTerminalAsyncError } from "./terminalRuntimeGeometry";
import {
  armPendingTerminalFocus,
  disconnectFocusObserver,
  disconnectResizeObserver,
  ensureXtermViewportStyle,
  isTerminalRecoveryRectSane,
  notifyTerminalResizeIfNeeded,
  parkTerminalHost,
  refreshTerminalRenderer,
  reportTerminalAsyncError,
  safeFitTerminal,
  scheduleAttachSafetyFit,
  setupResizeObserver,
  tryFocusTerminal,
  unparkTerminalHost,
} from "./terminalRuntimeGeometry";

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

// ─── Module State ──────────────────────────────────────────────────────────────

const runtimesByTabId = new Map<string, TerminalRuntimeEntry>();
const runtimeLayer = createFixedRuntimeLayer("terminal-root-host");
const pendingFocusTabIds = new Set<string>();
const MIN_TERMINAL_RECOVERY_WIDTH_PX = 48;
const MIN_TERMINAL_RECOVERY_HEIGHT_PX = 32;

type TerminalHostRect = Pick<DOMRectReadOnly, "width" | "height">;

// ─── Core Registry APIs ────────────────────────────────────────────────────────

/**
 * Returns an existing runtime entry or creates a new one in `idle` state.
 * The xterm Terminal instance is created immediately but not attached to any
 * visible placeholder yet — it renders into an offscreen host element managed
 * by the runtime layer.
 */
export function ensureTerminalRuntime(tabId: string, tabData?: TerminalTabData): TerminalRuntimeEntry {
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
    tabData: tabData ?? { workspaceId: "" },
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
    focusObserver: null,
    exited: false,
    lastReportedCols: -1,
    lastReportedRows: -1,
    lastFitAt: 0,
    pendingFocus: false,
  };

  if (pendingFocusTabIds.has(tabId)) {
    entry.pendingFocus = true;
    pendingFocusTabIds.delete(tabId);
  }

  runtimesByTabId.set(tabId, entry);
  armPendingTerminalFocus(entry, (tabId) => runtimesByTabId.get(tabId) ?? null);
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
    armPendingTerminalFocus(entry, (tabId) => runtimesByTabId.get(tabId) ?? null);
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
  setupResizeObserver(entry, onTerminalResized);

  // Perform one definitive fit on attach when host has non-zero area.
  const didFitOnAttach = safeFitTerminal(entry, true);

  // Notify resize handler so PTY gets the new dimensions after fit.
  notifyTerminalResizeIfNeeded(entry, didFitOnAttach, onTerminalResized);

  // Schedule a safety-net fit after attach.  On the next animation frame the
  // host should have settled to its final dimensions, so we re-attempt the fit
  // in case the initial synchronous fit was skipped or produced wrong
  // dimensions (e.g.  transient intermediate host rect).  The non-forced call
  // respects MIN_FIT_INTERVAL_MS, so when the initial fit already succeeded
  // this becomes a cheap no-op.
  //
  // Without this safety-net, the terminal can remain at the default 80×24 if
  // the ResizeObserver chain fails to fire for any reason.
  scheduleAttachSafetyFit(entry, version, (tabId) => runtimesByTabId.get(tabId) ?? null, onTerminalResized);

  // If this was a reattach from detached state, refresh the renderer and check for pending exit.
  if (wasDetached) {
    refreshTerminalRenderer(entry, "refresh terminal after reattach");
    onTerminalReattached?.(tabId);
  }

  armPendingTerminalFocus(entry, (tabId) => runtimesByTabId.get(tabId) ?? null, version);

  return version;
}

/**
 * Requests focus for one terminal runtime. If the runtime is not interactive yet,
 * focus is deferred until the xterm textarea is mounted into the host DOM.
 */
export function requestTerminalRuntimeFocus(tabId: string): void {
  const entry = runtimesByTabId.get(tabId);
  if (!entry) {
    pendingFocusTabIds.add(tabId);
    return;
  }

  if (entry.state === "disposed") {
    return;
  }

  if (tryFocusTerminal(entry)) {
    entry.pendingFocus = false;
    disconnectFocusObserver(entry);
    return;
  }

  entry.pendingFocus = true;
  armPendingTerminalFocus(entry, (tabId) => runtimesByTabId.get(tabId) ?? null);
}

/** Clears a pending focus request when its terminal tab closes before focus can be applied. */
export function clearTerminalRuntimeFocus(tabId: string): void {
  pendingFocusTabIds.delete(tabId);

  const entry = runtimesByTabId.get(tabId);
  if (!entry) {
    return;
  }

  entry.pendingFocus = false;
  disconnectFocusObserver(entry);
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
  disconnectFocusObserver(entry);

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
  disconnectFocusObserver(entry);
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
 * Forces a definitive fit for the provided attached terminal runtimes.
 * Used after layout changes that can move terminals between pane placeholders.
 */
export function forceFitTerminalRuntimes(tabIds: readonly string[]): void {
  for (const tabId of tabIds) {
    const entry = runtimesByTabId.get(tabId);
    if (!entry || entry.state !== "attached") {
      continue;
    }

    const didFit = safeFitTerminal(entry, true);
    notifyTerminalResizeIfNeeded(entry, didFit, onTerminalResized);
  }
}

/**
 * Gets an existing runtime entry (or null if not yet created/already disposed).
 */
export function getTerminalRuntime(tabId: string): TerminalRuntimeEntry | null {
  return runtimesByTabId.get(tabId) ?? null;
}

/**
 * Returns all active (non-disposed) terminal runtime entries.
 * Used by the reconnect flow to re-establish sessions after daemon restart.
 */
export function getActiveTerminalRuntimes(): TerminalRuntimeEntry[] {
  return Array.from(runtimesByTabId.values()).filter((entry) => entry.state !== "disposed");
}

/**
 * Returns true if the terminal runtime is currently attached and visible.
 */
export function isTerminalRuntimeAttached(tabId: string): boolean {
  const entry = runtimesByTabId.get(tabId);
  return entry?.state === "attached";
}

/**
 * Re-applies one attached runtime's layout/rendering state after the window
 * returns from long backgrounding or OS sleep.
 *
 * Returns true once the runtime had a sane host rect and completed one
 * fit/resize/refresh pass. Returns false when wake recovery should retry.
 */
export function recoverAttachedTerminalRuntime(tabId: string): boolean {
  const entry = runtimesByTabId.get(tabId);
  if (!entry || entry.state !== "attached") {
    return false;
  }

  runtimeLayer.refresh(tabId);

  const hostRect = entry.hostElement.getBoundingClientRect();
  if (!isTerminalRecoveryRectSane(hostRect)) {
    return false;
  }

  const didFit = safeFitTerminal(entry, true, hostRect);
  if (!didFit) {
    return false;
  }

  notifyTerminalResizeIfNeeded(entry, true, onTerminalResized);
  refreshTerminalRenderer(entry, "refresh terminal after background restore");
  return true;
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

/**
 * Schedules a delayed safety-net fit after terminal attach.
 *
 * Retries on the next animation frame to catch cases where the initial
 * synchronous fit in attachTerminalRuntime was skipped (host rect still
 * zero/transient) or produced wrong dimensions (transient intermediate rect).
 * If the host rect is still not ready after one frame, falls back to a
 * 100ms setTimeout retry.
 *
 * Uses a non-forced fit so that MIN_FIT_INTERVAL_MS throttles redundant
 * work when a subsequent synchronous fit (e.g. from a second attach call)
 * already succeeded before this callback fires.
 */

export function __resetTerminalRuntimeRegistryForTests(): void {
  for (const tabId of Array.from(runtimesByTabId.keys())) {
    disposeTerminalRuntime(tabId);
  }
  pendingFocusTabIds.clear();
}
