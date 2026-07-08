import { useCallback, useEffect, useRef } from "react";
import { recoverAttachedTerminalRuntime } from "./terminalRuntimeRegistry";

const WAKE_RECOVERY_DELAY_MS = [100, 300] as const;

/**
 * Replays terminal layout recovery across the first few frames after the app
 * regains focus or visibility, covering stale post-sleep measurements.
 */
export function useTerminalWakeRecovery(tabId: string): void {
  const retryAnimationFrameIdRef = useRef<number | null>(null);
  const retryTimeoutIdsRef = useRef<number[]>([]);

  const clearPendingWakeRecovery = useCallback(() => {
    if (retryAnimationFrameIdRef.current !== null) {
      window.cancelAnimationFrame(retryAnimationFrameIdRef.current);
      retryAnimationFrameIdRef.current = null;
    }

    for (const timeoutId of retryTimeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }
    retryTimeoutIdsRef.current = [];
  }, []);

  const runWakeRecovery = useCallback(() => recoverAttachedTerminalRuntime(tabId), [tabId]);

  const scheduleWakeRecovery = useCallback(() => {
    clearPendingWakeRecovery();
    if (runWakeRecovery()) {
      return;
    }

    retryAnimationFrameIdRef.current = window.requestAnimationFrame(() => {
      retryAnimationFrameIdRef.current = null;
      if (runWakeRecovery()) {
        clearPendingWakeRecovery();
      }
    });

    retryTimeoutIdsRef.current = WAKE_RECOVERY_DELAY_MS.map((delayMs) =>
      window.setTimeout(() => {
        if (runWakeRecovery()) {
          clearPendingWakeRecovery();
        }
      }, delayMs),
    );
  }, [clearPendingWakeRecovery, runWakeRecovery]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      scheduleWakeRecovery();
    };

    window.addEventListener("focus", scheduleWakeRecovery);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearPendingWakeRecovery();
      window.removeEventListener("focus", scheduleWakeRecovery);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearPendingWakeRecovery, scheduleWakeRecovery]);
}
