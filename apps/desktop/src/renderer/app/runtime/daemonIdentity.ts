import { sessionStore } from "@renderer/domains/session";
import { emitDesktopRpcEventToBus } from "../../events/desktopRpcEventBus";
import { getDesktopHostBridge } from "../../platform/hostBridge";
import { subscribeConnectionStatus } from "../../rpc";

/**
 * Daemon identity refresh runtime (desktop8 Phase 31: moved out of root RPC
 * into App Runtime).
 *
 * Refreshes daemon identity (id/version/wsUrl) whenever the daemon
 * WebSocket connects and emits the result into the desktop RPC event bus
 * (`daemon.info.refreshed`), which the Session Domain mirrors into
 * sessionStore.
 */

async function refreshDaemonIdentity(): Promise<void> {
  try {
    const info = await getDesktopHostBridge().getDaemonInfo();
    emitDesktopRpcEventToBus({
      method: "daemon.info.refreshed",
      payload: info,
    });
  } catch (error) {
    emitDesktopRpcEventToBus({
      method: "daemon.info.error",
      payload: { error },
    });
  }
}

/**
 * Starts the daemon identity refresh runtime: refreshes on every daemon
 * connection. Returns one teardown.
 */
export function startDaemonIdentityRuntime(): () => void {
  return subscribeConnectionStatus((status) => {
    if (status === "connected") {
      void refreshDaemonIdentity();
    }
  });
}
