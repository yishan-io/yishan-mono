import { useEffect, useState } from "react";
import { subscribeDaemonConnectionStatus, subscribeDaemonInfoRefresh } from "../../domains/session";

type DaemonConnectionStatus = "connected" | "connecting" | "disconnected";

export function useDaemonConnectionMonitor(): DaemonConnectionStatus {
  const [status, setStatus] = useState<DaemonConnectionStatus>("connecting");

  useEffect(() => {
    const unsubscribeStatus = subscribeDaemonConnectionStatus(setStatus);
    const unsubscribeDaemonInfo = subscribeDaemonInfoRefresh();

    return () => {
      unsubscribeDaemonInfo();
      unsubscribeStatus();
    };
  }, []);

  return status;
}
