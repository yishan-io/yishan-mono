import type {
  AppendBrowserHistoryInput,
  AuthStatusResult,
  BrowserHistoryGroup,
  DesktopCliInstallResult,
  DesktopCliInstallStatusResult,
  DaemonInfoResult,
  DaemonRestartResult,
} from "../../main/ipc";
import type { DesktopAgentKind } from "../helpers/agentSettings";
import { getDaemonClient, getDesktopHostBridge } from "../rpc/rpcTransport";
import { type LinkTarget, layoutStore } from "../store/settings/layoutStore";
import { tabStore } from "../store/tabStore";

/** Opens one native folder picker and returns a selected directory path when available. */
export async function openLocalFolderDialog(startingFolder?: string) {
  return await getDesktopHostBridge().openLocalFolderDialog({ startingFolder });
}

/** Reads default workspace worktree location from backend app settings. */
export async function getDefaultWorktreeLocation() {
  const client = await getDaemonClient();
  const response = await client.app.getDefaultWorktreeLocation(undefined);
  return response.worktreePath;
}

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

/** Opens one URL through the Electron main-process host bridge. */
export async function openExternalUrl(url: string) {
  return await getDesktopHostBridge().openExternalUrl({ url });
}

function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export type OpenLinkResult =
  | {
      opened: true;
    }
  | {
      opened: false;
      reason: string;
    };

export type OpenLinkOptions = {
  url: string;
  workspaceId?: string;
};

export async function openLink(options: OpenLinkOptions): Promise<OpenLinkResult> {
  const { url, workspaceId } = options;
  const linkTarget: LinkTarget = layoutStore.getState().linkTarget;

  if (linkTarget === "built-in" && isHttpUrl(url)) {
    const resolvedWorkspaceId = workspaceId ?? resolveActiveWorkspaceId();
    if (resolvedWorkspaceId) {
      tabStore.getState().openTab({ kind: "browser", workspaceId: resolvedWorkspaceId, url });
      return { opened: true };
    }
  }

  try {
    const result = await openExternalUrl(url);
    if (result.opened) {
      return { opened: true };
    }
    return { opened: false, reason: result.reason };
  } catch {
    return { opened: false, reason: "open-failed" };
  }
}

function resolveActiveWorkspaceId(): string | undefined {
  const state = tabStore.getState();
  const selectedTab = state.tabs.find((tab) => tab.id === state.selectedTabId);
  return selectedTab?.workspaceId || state.selectedWorkspaceId || undefined;
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

/** Reads current daemon identity and version from desktop main-process IPC. */
export async function getDaemonInfo(): Promise<DaemonInfoResult> {
  return await getDesktopHostBridge().getDaemonInfo();
}

/** Restarts the local daemon through the desktop main process. */
export async function restartDaemon(): Promise<DaemonRestartResult> {
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

/** Reads desktop-managed CLI install status from main-process IPC. */
export async function getDesktopCliInstallStatus(): Promise<DesktopCliInstallStatusResult> {
  return await getDesktopHostBridge().getDesktopCliInstallStatus();
}

/** Installs desktop-managed CLI symlink for terminal usage. */
export async function installDesktopCli(): Promise<DesktopCliInstallResult> {
  return await getDesktopHostBridge().installDesktopCli();
}

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

export async function loadBrowserHistory(): Promise<BrowserHistoryGroup[]> {
  return await getDesktopHostBridge().loadBrowserHistory();
}

export async function appendBrowserHistory(input: AppendBrowserHistoryInput): Promise<{ ok: true }> {
  return await getDesktopHostBridge().appendBrowserHistory(input);
}
