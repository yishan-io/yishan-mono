import type { AgentMessage } from "../store/agentChatTypes";

const HIDDEN_FLUSH_INTERVAL_MS = 500;

type StreamBufferEntry = {
  pendingMessage: AgentMessage | null;
  onFlush: ((message: AgentMessage) => void) | null;
  visible: boolean;
  animationFrameId: number | null;
  timerId: ReturnType<typeof setTimeout> | null;
};

const bufferEntriesByTabId = new Map<string, StreamBufferEntry>();

function getOrCreateEntry(tabId: string): StreamBufferEntry {
  const existing = bufferEntriesByTabId.get(tabId);
  if (existing) {
    return existing;
  }

  const created: StreamBufferEntry = {
    pendingMessage: null,
    onFlush: null,
    visible: true,
    animationFrameId: null,
    timerId: null,
  };
  bufferEntriesByTabId.set(tabId, created);
  return created;
}

function cancelScheduledFlush(entry: StreamBufferEntry): void {
  if (entry.animationFrameId !== null) {
    cancelAnimationFrame(entry.animationFrameId);
    entry.animationFrameId = null;
  }
  if (entry.timerId !== null) {
    clearTimeout(entry.timerId);
    entry.timerId = null;
  }
}

function flushEntry(entry: StreamBufferEntry): void {
  const pendingMessage = entry.pendingMessage;
  const onFlush = entry.onFlush;

  cancelScheduledFlush(entry);

  if (!pendingMessage || !onFlush) {
    return;
  }

  entry.pendingMessage = null;
  onFlush(pendingMessage);
}

function scheduleEntryFlush(entry: StreamBufferEntry): void {
  if (!entry.pendingMessage || !entry.onFlush) {
    return;
  }

  if (entry.visible) {
    if (entry.animationFrameId !== null) {
      return;
    }
    entry.animationFrameId = requestAnimationFrame(() => {
      entry.animationFrameId = null;
      flushEntry(entry);
    });
    return;
  }

  if (entry.timerId !== null) {
    return;
  }
  entry.timerId = setTimeout(() => {
    entry.timerId = null;
    flushEntry(entry);
  }, HIDDEN_FLUSH_INTERVAL_MS);
}

/** Queues one latest assistant stream snapshot and flushes it on the current visibility cadence. */
export function queueAgentChatStreamMessage(input: {
  tabId: string;
  message: AgentMessage;
  onFlush: (message: AgentMessage) => void;
}): void {
  const entry = getOrCreateEntry(input.tabId);
  entry.pendingMessage = input.message;
  entry.onFlush = input.onFlush;
  scheduleEntryFlush(entry);
}

/** Updates one tab's visibility; becoming visible forces an immediate catch-up flush. */
export function setAgentChatStreamTabVisible(tabId: string, visible: boolean): void {
  const entry = getOrCreateEntry(tabId);
  const wasVisible = entry.visible;
  entry.visible = visible;

  if (!wasVisible && visible && entry.pendingMessage) {
    flushEntry(entry);
    return;
  }

  if (wasVisible && !visible && entry.animationFrameId !== null) {
    cancelAnimationFrame(entry.animationFrameId);
    entry.animationFrameId = null;
    scheduleEntryFlush(entry);
  }
}

/** Returns the pending buffered stream update for one tab, if any. */
export function peekAgentChatStreamMessage(tabId: string): AgentMessage | null {
  return bufferEntriesByTabId.get(tabId)?.pendingMessage ?? null;
}

/** Flushes any pending buffered stream update immediately. */
export function flushAgentChatStreamBuffer(tabId: string): void {
  const entry = bufferEntriesByTabId.get(tabId);
  if (!entry) {
    return;
  }
  flushEntry(entry);
}

/** Disposes one tab's stream buffer state and cancels any pending timers. */
export function disposeAgentChatStreamBuffer(tabId: string): void {
  const entry = bufferEntriesByTabId.get(tabId);
  if (!entry) {
    return;
  }

  cancelScheduledFlush(entry);
  bufferEntriesByTabId.delete(tabId);
}
