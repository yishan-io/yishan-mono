import { useEffect, useState } from "react";
import type { DaemonInfoResult } from "../../main/ipc";
import { subscribeDaemonConnectionStatus, subscribeDesktopRpcEvent } from "../rpc/rpcTransport";
import { sessionStore } from "../features/session/model/sessionStore";

type DaemonConnectionStatus = "connected" | "connecting" | "disconnected";

function isDaemonInfo(value: unknown): value is DaemonInfoResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.daemonId === "string" && typeof record.version === "string" && typeof record.wsUrl === "string";
}

export function useDaemonConnectionMonitor(): DaemonConnectionStatus {
  const [status, setStatus] = useState<DaemonConnectionStatus>("connecting");

  useEffect(() => {
    const unsubscribeStatus = subscribeDaemonConnectionStatus(setStatus);
    const unsubscribeEvents = subscribeDesktopRpcEvent((event) => {
      if (event.method !== "daemon.info.refreshed" || !isDaemonInfo(event.payload)) {
        return;
      }

      sessionStore.getState().setDaemonInfo({
        daemonId: event.payload.daemonId,
        daemonVersion: event.payload.version,
      });
    });

    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
    };
  }, []);

  return status;
}
