import { useEffect, useRef, useState } from "react";
import type { TerminalResourceUsageSnapshot } from "../daemon/terminalWireTypes";
import { sharedTerminalResourceUsagePoller } from "../runtime/sharedTerminalResourceUsage";

/**
 * Subscribes one control to one shared terminal resource usage snapshot
 * stream (Phase 13, desktop5.md). The polling timer, snapshot cache, and
 * subscriber registry live in the terminal runtime
 * (`sharedTerminalResourceUsage.ts`); this hook only attaches React state to
 * the shared poller lifecycle.
 */
export function useSharedTerminalResourceUsageSnapshot(input: {
  enabled: boolean;
  interactive: boolean;
  fetchSnapshot: () => Promise<TerminalResourceUsageSnapshot>;
}): TerminalResourceUsageSnapshot | null {
  const [snapshot, setSnapshot] = useState<TerminalResourceUsageSnapshot | null>(() =>
    sharedTerminalResourceUsagePoller.getSnapshot(),
  );
  const subscriberIdRef = useRef<symbol>(Symbol("shared-terminal-resource-usage-subscriber"));

  useEffect(() => {
    const subscriberId = subscriberIdRef.current;
    sharedTerminalResourceUsagePoller.subscribe(subscriberId, setSnapshot);
    setSnapshot(sharedTerminalResourceUsagePoller.getSnapshot());
    sharedTerminalResourceUsagePoller.sync();

    return () => {
      sharedTerminalResourceUsagePoller.unsubscribe(subscriberId);
      sharedTerminalResourceUsagePoller.sync();
    };
  }, []);

  useEffect(() => {
    sharedTerminalResourceUsagePoller.updateSubscriber(subscriberIdRef.current, {
      enabled: input.enabled,
      interactive: input.interactive,
      fetchSnapshot: input.fetchSnapshot,
    });
    sharedTerminalResourceUsagePoller.sync();
  }, [input.enabled, input.fetchSnapshot, input.interactive]);

  return snapshot;
}
