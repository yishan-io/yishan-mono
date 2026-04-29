import type { TerminalResourceUsageSnapshot } from "../rpc/daemonTypes";
import { useEffect, useRef, useState } from "react";
import { withTimeout } from "../helpers/withTimeout";

const INTERACTIVE_POLL_INTERVAL_MS = 2000;
const IDLE_POLL_INTERVAL_MS = 15_000;
const REFRESH_TIMEOUT_MS = 10_000;

type SnapshotListener = (snapshot: TerminalResourceUsageSnapshot | null) => void;

type SharedSubscriber = {
  enabled: boolean;
  interactive: boolean;
  fetchSnapshot: () => Promise<TerminalResourceUsageSnapshot>;
  onSnapshot: SnapshotListener;
};

const subscribers = new Map<symbol, SharedSubscriber>();

let currentSnapshot: TerminalResourceUsageSnapshot | null = null;
let activeIntervalId: number | null = null;
let activeIntervalMs: number | null = null;
let inFlight = false;

/** Placeholder fetcher used before one real subscriber fetcher is wired in update effect. */
async function unsupportedFetchSnapshot(): Promise<TerminalResourceUsageSnapshot> {
  throw new Error("Unsupported fetch call before subscriber initialization");
}

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

/** Resets shared polling module state for deterministic unit tests. */
export function resetSharedTerminalResourceUsageSnapshotForTests(): void {
  subscribers.clear();
  stopPollingTimer();
  currentSnapshot = null;
  inFlight = false;
}

/** Subscribes one control to one shared terminal resource usage snapshot stream. */
export function useSharedTerminalResourceUsageSnapshot(input: {
  enabled: boolean;
  interactive: boolean;
  fetchSnapshot: () => Promise<TerminalResourceUsageSnapshot>;
}): TerminalResourceUsageSnapshot | null {
  const [snapshot, setSnapshot] = useState<TerminalResourceUsageSnapshot | null>(currentSnapshot);
  const subscriberIdRef = useRef<symbol>(Symbol("shared-terminal-resource-usage-subscriber"));

  useEffect(() => {
    const subscriberId = subscriberIdRef.current;
    subscribers.set(subscriberId, {
      enabled: false,
      interactive: false,
      fetchSnapshot: unsupportedFetchSnapshot,
      onSnapshot: setSnapshot,
    });
    setSnapshot(currentSnapshot);
    syncPollingTimer();

    return () => {
      subscribers.delete(subscriberId);
      syncPollingTimer();
    };
  }, []);

  useEffect(() => {
    const subscriber = subscribers.get(subscriberIdRef.current);
    if (!subscriber) {
      return;
    }

    subscriber.enabled = input.enabled;
    subscriber.interactive = input.interactive;
    subscriber.fetchSnapshot = input.fetchSnapshot;
    syncPollingTimer();
  }, [input.enabled, input.fetchSnapshot, input.interactive]);

  return snapshot;
}
