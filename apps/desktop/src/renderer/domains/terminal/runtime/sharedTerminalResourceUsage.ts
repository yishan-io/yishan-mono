import { withTimeout } from "../../../helpers/withTimeout";
import type { TerminalResourceUsageSnapshot } from "../../../rpc/daemonTypes";

const INTERACTIVE_POLL_INTERVAL_MS = 2000;
const IDLE_POLL_INTERVAL_MS = 15_000;
const REFRESH_TIMEOUT_MS = 10_000;

type SnapshotListener = (snapshot: TerminalResourceUsageSnapshot | null) => void;

export type SharedSubscriber = {
  enabled: boolean;
  interactive: boolean;
  fetchSnapshot: () => Promise<TerminalResourceUsageSnapshot>;
  onSnapshot: SnapshotListener;
};

/** Placeholder fetcher used before one real subscriber fetcher is wired in. */
async function unsupportedFetchSnapshot(): Promise<TerminalResourceUsageSnapshot> {
  throw new Error("Unsupported fetch call before subscriber initialization");
}

/**
 * Shared terminal resource usage poller (Phase 13, desktop5.md).
 *
 * Long-lived resource: owns the subscriber registry, the current snapshot,
 * the polling timer policy (2s interactive / 15s idle), and the in-flight
 * guard. Multiple UI controls subscribe to ONE shared snapshot stream so
 * the terminal resource usage is polled once per interval instead of once
 * per control.
 */
export function createSharedTerminalResourceUsagePoller() {
  const subscribers = new Map<symbol, SharedSubscriber>();

  let currentSnapshot: TerminalResourceUsageSnapshot | null = null;
  let activeIntervalId: number | null = null;
  let activeIntervalMs: number | null = null;
  let inFlight = false;

  /** Broadcasts one latest shared snapshot to all subscribers. */
  function publishSnapshot(snapshot: TerminalResourceUsageSnapshot | null): void {
    for (const subscriber of subscribers.values()) {
      subscriber.onSnapshot(snapshot);
    }
  }

  /** Returns current subscribers that opted into active polling. */
  function listEnabledSubscribers(): SharedSubscriber[] {
    return [...subscribers.values()].filter((subscriber) => subscriber.enabled);
  }

  /** Stops one active polling timer when shared polling is no longer needed. */
  function stopPollingTimer(): void {
    if (activeIntervalId !== null) {
      window.clearInterval(activeIntervalId);
      activeIntervalId = null;
    }
    activeIntervalMs = null;
  }

  /** Refreshes one shared terminal resource snapshot from one active subscriber fetcher. */
  async function refreshSnapshotOnce(): Promise<void> {
    if (inFlight) {
      return;
    }
    const fetcher = listEnabledSubscribers()[0]?.fetchSnapshot;
    if (!fetcher) {
      return;
    }

    inFlight = true;
    try {
      const nextSnapshot = await withTimeout(
        Promise.resolve().then(() => fetcher()),
        REFRESH_TIMEOUT_MS,
        `Shared resource usage refresh timed out after ${REFRESH_TIMEOUT_MS}ms.`,
      );
      currentSnapshot = nextSnapshot;
      publishSnapshot(nextSnapshot);
    } catch (error) {
      console.error("[useSharedTerminalResourceUsageSnapshot] Failed to load resource usage", error);
    } finally {
      inFlight = false;
    }
  }

  /** Reconciles one shared polling interval after subscriber state changes. */
  function syncPollingTimer(): void {
    const enabledSubscribers = listEnabledSubscribers();
    if (enabledSubscribers.length === 0) {
      stopPollingTimer();
      return;
    }

    const nextIntervalMs = enabledSubscribers.some((subscriber) => subscriber.interactive)
      ? INTERACTIVE_POLL_INTERVAL_MS
      : IDLE_POLL_INTERVAL_MS;
    if (activeIntervalId !== null && activeIntervalMs === nextIntervalMs) {
      return;
    }

    stopPollingTimer();
    activeIntervalMs = nextIntervalMs;
    void refreshSnapshotOnce();
    activeIntervalId = window.setInterval(() => {
      void refreshSnapshotOnce();
    }, nextIntervalMs);
  }

  return {
    /** Registers one subscriber; snapshot delivery goes through its listener. */
    subscribe(subscriberId: symbol, onSnapshot: SnapshotListener): void {
      subscribers.set(subscriberId, {
        enabled: false,
        interactive: false,
        fetchSnapshot: unsupportedFetchSnapshot,
        onSnapshot,
      });
    },
    unsubscribe(subscriberId: symbol): void {
      subscribers.delete(subscriberId);
    },
    /** Applies one subscriber's current polling options. */
    updateSubscriber(
      subscriberId: symbol,
      input: { enabled: boolean; interactive: boolean; fetchSnapshot: () => Promise<TerminalResourceUsageSnapshot> },
    ): void {
      const subscriber = subscribers.get(subscriberId);
      if (!subscriber) {
        return;
      }
      subscriber.enabled = input.enabled;
      subscriber.interactive = input.interactive;
      subscriber.fetchSnapshot = input.fetchSnapshot;
    },
    getSnapshot(): TerminalResourceUsageSnapshot | null {
      return currentSnapshot;
    },
    /** Reconciles the polling timer after subscriber changes. */
    sync(): void {
      syncPollingTimer();
    },
    /** Resets shared polling state for deterministic unit tests. */
    reset(): void {
      subscribers.clear();
      stopPollingTimer();
      currentSnapshot = null;
      inFlight = false;
    },
  };
}

export type SharedTerminalResourceUsagePoller = ReturnType<typeof createSharedTerminalResourceUsagePoller>;

/** The application-wide shared poller singleton. */
export const sharedTerminalResourceUsagePoller = createSharedTerminalResourceUsagePoller();

/** Resets shared polling module state for deterministic unit tests. */
export function resetSharedTerminalResourceUsageSnapshotForTests(): void {
  sharedTerminalResourceUsagePoller.reset();
}
