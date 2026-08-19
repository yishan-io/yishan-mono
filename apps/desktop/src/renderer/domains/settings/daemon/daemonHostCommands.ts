/**
 * Daemon host commands (D16).
 *
 * Daemon process management capabilities hosted by the Electron main process.
 * The Settings Domain owns the daemon settings surface, so these commands live
 * in the Settings Domain's infrastructure layer; `app/commands/appCommands`
 * re-exports them for app-level callers (e.g. session bootstrap).
 */
import { getDesktopHostBridge } from "@renderer/platform/hostBridge";

export type { DaemonInfoResult, DaemonLogResult, DaemonRestartResult } from "../../../../main/ipc";

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
export async function getDaemonLog() {
  return getDesktopHostBridge().readDaemonLog();
}
