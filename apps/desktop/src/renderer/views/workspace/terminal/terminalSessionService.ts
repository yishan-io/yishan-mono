import { closeTab, renameTab } from "../../../commands/tabCommands";
import {
  createTerminalSession,
  listTerminalSessions,
  readTerminalOutput,
  resizeTerminal,
  subscribeTerminalOutput,
  writeTerminalInput,
} from "../../../commands/terminalCommands";
import { subscribeDaemonConnectionStatus } from "../../../rpc/rpcTransport";
import { tabStore } from "../../../store/tabStore";
import type { WorkspaceTab } from "../../../store/types";
import {
  shouldClearTerminalOutputShortcut,
  shouldReleaseCommandWForTabCloseShortcut,
  shouldReleaseWorkspaceNavigationShortcut,
} from "./terminalKeyboardUtils";
import {
  ensureTerminalRuntime,
  getActiveTerminalRuntimes,
  getTerminalRuntime,
  reportTerminalAsyncError,
  setTerminalDisposeHandler,
  setTerminalOutputSubscription,
  setTerminalReattachHandler,
  setTerminalResizeHandler,
  setTerminalSessionId,
  updateTerminalReadIndex,
} from "./terminalRuntimeRegistry";
import type { TerminalRuntimeEntry } from "./terminalRuntimeRegistry";
import { TerminalSessionOrchestrator } from "./terminalSessionOrchestrator";
import {
  formatTerminalCommandTitle,
  formatTerminalPathTitle,
  resolveTerminalWorkspacePath,
} from "./terminalTitleUtils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type TerminalTab = Extract<WorkspaceTab, { kind: "terminal" }>;

// ─── Module State ──────────────────────────────────────────────────────────────

/**
 * Tracks which tabs have had their session lifecycle started,
 * to prevent duplicate initialization.
 */
const initializedTabs = new Set<string>();

/**
 * Tracks the last applied title per tab to avoid redundant rename calls.
 */
const lastAppliedTitleByTabId = new Map<string, string>();
const terminalPerfByTabId = new Map<string, { intervalStartAt: number; messageCount: number; byteCount: number }>();

const TERMINAL_PERF_LOGGING_STORAGE_KEY = "yishan.terminal.perfLogging";
const TERMINAL_PERF_LOG_INTERVAL_MS = 2_000;

// Register handlers with the registry (avoiding circular imports).
setTerminalResizeHandler(sendTerminalResize);
setTerminalDisposeHandler(cleanupTerminalSessionLifecycle);
setTerminalReattachHandler(handleReattach);

// ─── Daemon Reconnect Handling ─────────────────────────────────────────────────

let daemonReconnectSeen = false;

subscribeDaemonConnectionStatus((status) => {
  if (status === "disconnected") {
    daemonReconnectSeen = true;
    return;
  }

  if (status !== "connected" || !daemonReconnectSeen) {
    return;
  }

  daemonReconnectSeen = false;
  reconnectAllTerminalSessions();
});

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Initializes the terminal session lifecycle for a given tab.
 * Idempotent — calling multiple times for the same tabId is a no-op.
 */
export function initTerminalSessionLifecycle(tabId: string): void {
  if (initializedTabs.has(tabId)) {
    return;
  }
  initializedTabs.add(tabId);

  const entry = ensureTerminalRuntime(tabId);

  // Set up keyboard shortcuts, input forwarding, and title tracking.
  setupKeyboardShortcuts(entry);
  setupInputForwarding(entry, tabId);
  setupTitleTracking(entry, tabId);

  // Kick off session resolution asynchronously.
  void resolveAndSubscribeSession(entry, tabId).catch((error) => {
    reportTerminalAsyncError("init terminal session lifecycle", error);
  });
}

/**
 * Cleans up session lifecycle tracking for a disposed tab.
 */
export function cleanupTerminalSessionLifecycle(tabId: string): void {
  initializedTabs.delete(tabId);
  lastAppliedTitleByTabId.delete(tabId);
  terminalPerfByTabId.delete(tabId);
}

/**
 * Returns the session ID for a tab (if resolved), for use by resize handlers.
 */
export function getTerminalSessionId(tabId: string): string | null {
  const entry = getTerminalRuntime(tabId);
  return entry?.sessionId ?? null;
}

/**
 * Sends a resize command to the PTY for the given tab's current terminal dimensions.
 */
export function sendTerminalResize(tabId: string): void {
  const entry = getTerminalRuntime(tabId);
  const tab = findTerminalTab(tabId);
  if (!entry?.sessionId || !tab?.workspaceId) {
    return;
  }

  void resizeTerminal({
    workspaceId: tab.workspaceId,
    sessionId: entry.sessionId,
    cols: entry.terminal.cols,
    rows: entry.terminal.rows,
  }).catch((error) => {
    reportTerminalAsyncError("resize terminal", error);
  });
}

/**
 * Called by the registry when a previously-detached terminal is reattached.
 * Checks if the session exited while detached and closes the tab.
 */
export function handleReattach(tabId: string): void {
  const entry = getTerminalRuntime(tabId);
  if (!entry) {
    return;
  }

  if (entry.exited && !entry.didRequestClose) {
    entry.didRequestClose = true;
    closeTab(tabId);
  }
}

/** Test-only helper: clears module singleton state between unit tests. */
export function __resetTerminalSessionServiceForTests(): void {
  initializedTabs.clear();
  lastAppliedTitleByTabId.clear();
  daemonReconnectSeen = false;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Re-establishes all active terminal sessions after a daemon reconnect.
 *
 * When the daemon restarts, all prior PTY sessions are gone. For each
 * active (non-exited) terminal runtime this function:
 *   1. Drops the old output subscription (which targets the now-gone session).
 *   2. Resets the xterm buffer so old output is not shown alongside new session output.
 *   3. Re-runs resolveAndSubscribeSession to create a fresh PTY session.
 */
function reconnectAllTerminalSessions(): void {
  const activeRuntimes = getActiveTerminalRuntimes();
  for (const entry of activeRuntimes) {
    if (entry.exited || entry.didRequestClose) {
      continue;
    }

    // Tear down the subscription referencing the old session.
    entry.outputSubscription?.unsubscribe();
    entry.outputSubscription = null;

    // Reset the xterm buffer so old output is not shown alongside new session output.
    // reset() clears the full display and scrollback; clear() only clears scrollback.
    try {
      entry.terminal.reset();
    } catch {
      // Ignore errors during reset — the session will still be re-established.
    }

    // Clear any cached title for this tab so the new session can set it.
    lastAppliedTitleByTabId.delete(entry.tabId);

    // Kick off session resolution for this entry.
    void resolveAndSubscribeSession(entry, entry.tabId).catch((error) => {
      reportTerminalAsyncError("reconnect terminal session after daemon restart", error);
    });
  }
}

function setupKeyboardShortcuts(entry: TerminalRuntimeEntry): void {
  entry.terminal.attachCustomKeyEventHandler((event) => {
    if (shouldReleaseCommandWForTabCloseShortcut(event)) {
      return false;
    }

    if (shouldReleaseWorkspaceNavigationShortcut(event)) {
      return false;
    }

    if (shouldClearTerminalOutputShortcut(event)) {
      if (event.type === "keydown") {
        entry.terminal.clear();
      }
      return false;
    }

    if (!(event.shiftKey && event.key === "Enter")) {
      return true;
    }

    if (event.type !== "keydown") {
      return false;
    }

    if (!entry.sessionId) {
      return false;
    }

    entry.terminal.paste("\n");
    return false;
  });
}

function setupInputForwarding(entry: TerminalRuntimeEntry, tabId: string): void {
  entry.terminal.onData((data) => {
    const sessionId = entry.sessionId;
    const workspaceId = findTerminalTab(tabId)?.workspaceId;
    if (!sessionId || !workspaceId) {
      return;
    }

    void writeTerminalInput({ workspaceId, sessionId, data }).catch((error) => {
      reportTerminalAsyncError("write terminal input", error);
    });
  });
}

function setupTitleTracking(entry: TerminalRuntimeEntry, tabId: string): void {
  entry.terminal.onTitleChange((title) => {
    applyTitleFromCommand(tabId, title);
  });
}

async function resolveAndSubscribeSession(entry: TerminalRuntimeEntry, tabId: string): Promise<void> {
  const orchestrator = new TerminalSessionOrchestrator({
    createTerminalSession,
    listTerminalSessions,
    readTerminalOutput,
    resizeTerminal,
    writeTerminalInput,
  });

  const restored = await orchestrator.attachOrCreateAndRestore({
    tabId,
    terminal: entry.terminal,
    fitAddon: entry.fitAddon,
  });

  // Guard: reject stale completions if runtime was disposed or recreated
  // during the async call. Reference equality detects both disposal (null)
  // and recreation (new object) without false positives from state transitions.
  if (getTerminalRuntime(tabId) !== entry) {
    return;
  }

  if (!restored) {
    return;
  }

  // Store session info on the runtime entry.
  entry.sessionId = restored.sessionId;
  entry.readIndex = restored.nextIndex;
  entry.didRequestClose = false;
  setTerminalSessionId(tabId, restored.sessionId);
  updateTerminalReadIndex(tabId, restored.nextIndex);

  // Apply initial title.
  const terminalTab = findTerminalTab(tabId);
  if (terminalTab?.data.launchCommand) {
    applyTitleFromCommand(tabId, terminalTab.data.launchCommand);
  } else {
    applyTitleFromPath(tabId, resolveTerminalWorkspacePath(terminalTab));
  }

  // Subscribe to live output — this subscription survives detach/attach.
  const subscription = await subscribeTerminalOutput({
    workspaceId: terminalTab?.workspaceId,
    sessionId: restored.sessionId,
    onData: (payload) => {
      // Guard against stale callbacks if runtime was disposed.
      if (getTerminalRuntime(tabId) !== entry) {
        return;
      }

      if (payload.sessionId !== entry.sessionId) {
        return;
      }

      if (payload.type === "output") {
        if (payload.nextIndex <= entry.readIndex) {
          return;
        }
        entry.readIndex = payload.nextIndex;
        updateTerminalReadIndex(tabId, payload.nextIndex);

        const { chunk } = payload;
        reportTerminalOutputPerf(tabId, chunk instanceof Uint8Array ? chunk.byteLength : chunk.length);
        if (chunk instanceof Uint8Array) {
          if (chunk.byteLength > 0) {
            entry.writeQueue.enqueue(chunk);
          }
        } else if (typeof chunk === "string" && chunk.length > 0) {
          entry.writeQueue.enqueue(chunk);
        }
        return;
      }

      // Exit event.
      if (entry.didRequestClose) {
        return;
      }
      entry.didRequestClose = true;
      entry.exited = true;

      if (entry.state === "attached" || entry.state === "attaching") {
        closeTab(tabId);
      }
      // If detached, handleReattach will close on next attach.
    },
    onError: (error) => {
      reportTerminalAsyncError("subscribe terminal output", error);
    },
  });

  // Guard: reject stale subscription if runtime was disposed during async subscribe.
  if (getTerminalRuntime(tabId) !== entry) {
    subscription.unsubscribe();
    return;
  }

  setTerminalOutputSubscription(tabId, subscription);

  // If session already exited before we subscribed, handle now.
  if (restored.exited && !entry.didRequestClose) {
    entry.didRequestClose = true;
    entry.exited = true;
    if (entry.state === "attached" || entry.state === "attaching") {
      closeTab(tabId);
    }
  }
}

function applyTitleFromCommand(tabId: string, command: string): void {
  if (isUserRenamed(tabId)) {
    return;
  }
  const title = formatTerminalCommandTitle(command);
  if (!title || title === lastAppliedTitleByTabId.get(tabId)) {
    return;
  }
  lastAppliedTitleByTabId.set(tabId, title);
  renameTab(tabId, title);
}

function applyTitleFromPath(tabId: string, path: string | undefined): void {
  if (isUserRenamed(tabId)) {
    return;
  }
  const title = formatTerminalPathTitle(path);
  if (!title || title === lastAppliedTitleByTabId.get(tabId)) {
    return;
  }
  lastAppliedTitleByTabId.set(tabId, title);
  renameTab(tabId, title);
}

function isUserRenamed(tabId: string): boolean {
  const tab = findTerminalTab(tabId);
  return tab?.data.userRenamed === true;
}

function findTerminalTab(tabId: string): TerminalTab | undefined {
  return tabStore
    .getState()
    .tabs.find((candidate): candidate is TerminalTab => candidate.id === tabId && candidate.kind === "terminal");
}

function reportTerminalOutputPerf(tabId: string, chunkBytes: number): void {
  if (!isTerminalPerfLoggingEnabled()) {
    return;
  }

  const now = Date.now();
  const current = terminalPerfByTabId.get(tabId) ?? { intervalStartAt: now, messageCount: 0, byteCount: 0 };
  current.messageCount += 1;
  current.byteCount += chunkBytes;

  const elapsedMs = Math.max(1, now - current.intervalStartAt);
  if (elapsedMs < TERMINAL_PERF_LOG_INTERVAL_MS) {
    terminalPerfByTabId.set(tabId, current);
    return;
  }

  const messagesPerSec = (current.messageCount * 1_000) / elapsedMs;
  const bytesPerSec = (current.byteCount * 1_000) / elapsedMs;
  console.info(`[TerminalPerf][${tabId}] msg/s=${messagesPerSec.toFixed(1)} bytes/s=${Math.round(bytesPerSec)}`);
  terminalPerfByTabId.set(tabId, { intervalStartAt: now, messageCount: 0, byteCount: 0 });
}

function isTerminalPerfLoggingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(TERMINAL_PERF_LOGGING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
