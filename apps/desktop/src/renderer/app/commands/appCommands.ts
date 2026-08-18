import type { DesktopAgentKind } from "@renderer/domains/agent";
import { openExternalUrl } from "@renderer/domains/browser";
import {
  getDaemonInfo,
  getDaemonLog,
  getDaemonQuitOnExit,
  restartDaemon,
  setDaemonQuitOnExit,
} from "@renderer/domains/settings";
import { openTab, workbenchNavigationStore } from "@renderer/domains/workbench";
import { workspaceStore } from "@renderer/domains/workspace";
import type { AuthStatusResult, DesktopUpdateEventPayload } from "../../../main/ipc";
import { resetAuthExpiredState } from "../../api/restClient";
import { sessionStore } from "../../domains/session";
import { rendererQueryClient } from "../../queryClient";
import { getDaemonClient, getDesktopBridge, getDesktopHostBridge } from "../../rpc/rpcTransport";

/** Checks whether one agent global config grants external directory access. */
export async function checkAgentGlobalConfigExternalDirectoryPermission(params?: { agentKind?: DesktopAgentKind }) {
  const client = await getDaemonClient();
  return client.app.checkAgentGlobalConfigExternalDirectoryPermission(params ?? {});
}

/** Ensures one agent global config grants external directory access. */
export async function ensureAgentGlobalConfigExternalDirectoryPermission(params?: { agentKind?: DesktopAgentKind }) {
  const client = await getDaemonClient();
  return client.app.ensureAgentGlobalConfigExternalDirectoryPermission(params ?? {});
}

/** Toggles the main desktop window maximized state. */
export async function toggleMainWindowMaximized() {
  return await getDesktopHostBridge().toggleMainWindowMaximized();
}

/** Returns whether the main desktop window currently runs in fullscreen mode. */
export async function getMainWindowFullscreenState() {
  return await getDesktopHostBridge().getMainWindowFullscreenState();
}

/** Clears renderer and daemon auth state for one desktop logout flow. */
export async function logout(): Promise<void> {
  try {
    const daemonClient = await getDaemonClient();
    await daemonClient.app.logout();
  } catch (error) {
    console.warn("Failed to clear daemon auth state during logout", error);
  }

  resetAuthExpiredState();
  sessionStore.getState().setAuthState(false, true);
  sessionStore.getState().clearSessionData();
  rendererQueryClient.clear();
}

/** Reads current desktop authentication status from main-process IPC. */
export async function getAuthStatus(): Promise<AuthStatusResult> {
  try {
    const client = await getDaemonClient();
    const result = await client.app.checkAuthStatus();
    return {
      authenticated: result.authenticated,
      expiresAt: result.accessTokenExpiresAt,
    };
  } catch {
    return { authenticated: false };
  }
}

/** Reads the currently running desktop app version from main-process IPC. */
export async function getDesktopAppVersion(): Promise<string> {
  return await getDesktopHostBridge().getDesktopAppVersion();
}

export { getDaemonInfo, getDaemonQuitOnExit, restartDaemon, setDaemonQuitOnExit };

/** Runs one desktop login flow through main-process IPC. */
export async function login() {
  const result = await getDesktopHostBridge().login();
  if (result.authenticated) {
    try {
      const daemonClient = await getDaemonClient();
      await daemonClient.app.reloadAuthConfig();
    } catch {}
  }
  return result;
}

// ─── Desktop update surface ────────────────────────────────────────────────────
// Owns the Electron bridge update calls so UI never imports the bridge value
// or main-process types directly (UpdateRuntime ownership: Phase 9).

/** Reads one pending update payload from the Electron host, if any. */
export async function getPendingDesktopUpdate() {
  return await getDesktopHostBridge().getPendingUpdate();
}

/** Subscribes one listener to desktopUpdate bridge events. Returns a teardown. */
export function subscribeDesktopUpdates(listener: (payload: DesktopUpdateEventPayload) => void): () => void {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return () => {};
  }
  return bridge.events.subscribe((event: { method?: string; payload?: unknown }) => {
    if (event.method !== "desktopUpdate") {
      return;
    }
    const payload = event.payload;
    if (payload && typeof payload === "object" && "status" in payload) {
      listener(payload as DesktopUpdateEventPayload);
    }
  });
}

/** Asks the Electron host to dismiss the update prompt. */
export function dismissDesktopUpdate(): void {
  void getDesktopHostBridge().dismissUpdate();
}

/** Downloads the pending update. */
export function downloadDesktopUpdate() {
  return getDesktopHostBridge().downloadUpdate();
}

/** Installs the downloaded update. */
export function installDesktopUpdate() {
  return getDesktopHostBridge().installUpdate();
}

export type { DesktopUpdateEventPayload } from "../../../main/ipc";

export { getDaemonLog };
export type { DaemonInfoResult, DaemonLogResult, DaemonRestartResult } from "@renderer/domains/settings";
