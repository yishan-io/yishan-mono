import {
  MIN_FIT_INTERVAL_MS,
  MIN_HOST_SIZE_DELTA_PX,
  RESIZE_DEBOUNCE_MS,
  type TerminalRuntimeEntry,
} from "./terminalRuntimeTypes";

/**
 * Terminal runtime geometry helpers (desktop8 Phase 33: split from
 * terminalRuntimeRegistry.ts).
 *
 * Fit/refresh/resize-observer and host parking helpers operate on one
 * runtime entry; the resize callback is injected so this module stays free
 * of the registry map.
 */

const MIN_TERMINAL_RECOVERY_WIDTH_PX = 48;
const MIN_TERMINAL_RECOVERY_HEIGHT_PX = 32;

type TerminalHostRect = Pick<DOMRectReadOnly, "width" | "height">;

export function parkTerminalHost(entry: TerminalRuntimeEntry): void {
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

export function unparkTerminalHost(entry: TerminalRuntimeEntry): void {
  entry.hostElement.removeAttribute("aria-hidden");
  entry.hostElement.removeAttribute("inert");
  // visibility and pointer-events are restored by runtimeLayer.attach()
  // which sets them based on the placeholder rect.
}

export function setupResizeObserver(
  entry: TerminalRuntimeEntry,
  onTerminalResized: ((tabId: string) => void) | null,
): void {
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
      notifyTerminalResizeIfNeeded(entry, didFit, onTerminalResized);
    }, RESIZE_DEBOUNCE_MS);
  });

  observer.observe(entry.hostElement);
  entry.resizeObserver = observer;
}

export function disconnectResizeObserver(entry: TerminalRuntimeEntry): void {
  entry.resizeObserver?.disconnect();
  entry.resizeObserver = null;
}

export function disconnectFocusObserver(entry: TerminalRuntimeEntry): void {
  entry.focusObserver?.disconnect();
  entry.focusObserver = null;
}

export function isTerminalRecoveryRectSane(hostRect: TerminalHostRect): boolean {
  return hostRect.width >= MIN_TERMINAL_RECOVERY_WIDTH_PX && hostRect.height >= MIN_TERMINAL_RECOVERY_HEIGHT_PX;
}

export function safeFitTerminal(entry: TerminalRuntimeEntry, force = false, hostRect?: TerminalHostRect): boolean {
  if (entry.state !== "attached" && entry.state !== "attaching") {
    return false;
  }

  if (!force && Date.now() - entry.lastFitAt < MIN_FIT_INTERVAL_MS) {
    return false;
  }

  const rect = hostRect ?? entry.hostElement.getBoundingClientRect();
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

export function refreshTerminalRenderer(entry: TerminalRuntimeEntry, action: string): void {
  const refresh = (entry.terminal as { refresh?: (start: number, end: number) => void }).refresh;
  if (typeof refresh !== "function") {
    return;
  }

  try {
    refresh.call(entry.terminal, 0, Math.max(0, entry.terminal.rows - 1));
  } catch (error) {
    reportTerminalAsyncError(action, error);
  }
}

export function notifyTerminalResizeIfNeeded(
  entry: TerminalRuntimeEntry,
  didFit: boolean,
  onTerminalResized: ((tabId: string) => void) | null,
): void {
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

export function tryFocusTerminal(entry: TerminalRuntimeEntry): boolean {
  if (entry.state !== "attached") {
    return false;
  }

  const terminalInput = entry.terminal.textarea ?? entry.hostElement.querySelector("textarea");
  if (!(terminalInput instanceof HTMLTextAreaElement) || !terminalInput.isConnected) {
    return false;
  }

  terminalInput.focus();
  entry.terminal.focus();
  return document.activeElement === terminalInput;
}

/** Test-only helper: clears all runtime entries between unit tests. */

const XTERM_VIEWPORT_STYLE_ID = "yishan-xterm-viewport-style";
const XTERM_RIGHT_OVERSCAN_PX = 16;
const XTERM_BOTTOM_OVERSCAN_PX = 16;

export function ensureXtermViewportStyle(): void {
  if (document.getElementById(XTERM_VIEWPORT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = XTERM_VIEWPORT_STYLE_ID;
  style.textContent = [
    "[data-terminal-tab-id] {",
    "  overflow: hidden !important;",
    "}",
    "[data-terminal-tab-id] .xterm-screen {",
    `  width: calc(100% + ${XTERM_RIGHT_OVERSCAN_PX}px) !important;`,
    `  height: calc(100% + ${XTERM_BOTTOM_OVERSCAN_PX}px) !important;`,
    "}",
    "[data-terminal-tab-id] .xterm-viewport {",
    "  overflow-y: scroll !important;",
    "  scrollbar-width: none !important;",
    "}",
    "[data-terminal-tab-id] .xterm-viewport::-webkit-scrollbar {",
    "  display: none !important;",
    "}",
  ].join("\n");
  document.head.appendChild(style);
}

export function scheduleAttachSafetyFit(
  entry: TerminalRuntimeEntry,
  version: number,
  getRuntime: (tabId: string) => TerminalRuntimeEntry | null,
  onTerminalResized: ((tabId: string) => void) | null,
): void {
  const runSafetyFit = () => {
    const current = getRuntime(entry.tabId);
    if (!current || current.version !== version) {
      return;
    }

    if (current.state !== "attached") {
      return;
    }

    const hostRect = current.hostElement.getBoundingClientRect();
    if (hostRect.width <= 1 || hostRect.height <= 1) {
      return false;
    }

    const didFit = safeFitTerminal(current);
    notifyTerminalResizeIfNeeded(current, didFit, onTerminalResized);
    return true;
  };

  requestAnimationFrame(() => {
    if (!runSafetyFit()) {
      // Host rect still not ready after one frame — retry once more after
      // a short delay in case layout needs multiple frames to settle.
      setTimeout(() => {
        runSafetyFit();
      }, 100);
    }
  });
}
export function armPendingTerminalFocus(
  entry: TerminalRuntimeEntry,
  getRuntime: (tabId: string) => TerminalRuntimeEntry | null,
  version?: number,
): void {
  if (!entry.pendingFocus) {
    disconnectFocusObserver(entry);
    return;
  }

  if (tryFocusTerminal(entry)) {
    entry.pendingFocus = false;
    disconnectFocusObserver(entry);
    return;
  }

  if (entry.state !== "attached" && entry.state !== "attaching") {
    return;
  }

  const expectedVersion = version ?? entry.version;
  disconnectFocusObserver(entry);
  const observer = new MutationObserver(() => {
    const latestEntry = getRuntime(entry.tabId);
    if (!latestEntry || latestEntry.version !== expectedVersion) {
      disconnectFocusObserver(entry);
      return;
    }

    if (!latestEntry.pendingFocus) {
      disconnectFocusObserver(latestEntry);
      return;
    }

    if (!tryFocusTerminal(latestEntry)) {
      return;
    }

    latestEntry.pendingFocus = false;
    disconnectFocusObserver(latestEntry);
  });

  observer.observe(entry.hostElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  entry.focusObserver = observer;
}
