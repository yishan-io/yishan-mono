/**
 * Daemon host boundary — daemon process lifecycle via the Electron main process.
 *
 * A host adapter, not a Command: each function forwards one host-bridge call
 * (desktop-domain-rules). The Settings Domain owns the daemon settings
 * surface; `app/commands/appCommands` re-exports these for app-level callers
 * (e.g. session bootstrap).
 */
import { getDesktopHostBridge } from "@renderer/platform/hostBridge";

export type {
  DaemonInfoResult,
  DaemonLogResult,
  DaemonLogSource,
  DaemonRestartResult,
} from "../../../../main/bridge/daemon";

/** Reads current daemon identity and version from desktop main-process IPC. */
export async function getDaemonInfo() {
  return await getDesktopHostBridge().getDaemonInfo();
}

/** Restarts the local daemon through the desktop main process. */
export async function restartDaemon() {
  return await getDesktopHostBridge().restartDaemon();
}

/** Reads the persisted quit-daemon-before-app-exit setting. */
export async function getDaemonQuitOnExit(): Promise<boolean> {
  return await getDesktopHostBridge().getDaemonQuitOnExit();
}

/** Persists the quit-daemon-before-app-exit setting. */
export async function setDaemonQuitOnExit(value: boolean): Promise<void> {
  await getDesktopHostBridge().setDaemonQuitOnExit(value);
}

/** Reads the daemon log from the Electron host. */
export async function getDaemonLog(source: import("../../../../main/bridge/daemon").DaemonLogSource) {
  return getDesktopHostBridge().readDaemonLog(source);
}
