import type { AgentKind } from "@yishan/agent-runtime";
import { getApiServiceClient, getDesktopHostBridge } from "../rpc/rpcTransport";

/** Opens one native folder picker and returns a selected directory path when available. */
export async function openLocalFolderDialog(startingFolder?: string) {
  return await getDesktopHostBridge().openLocalFolderDialog({ startingFolder });
}

/** Reads default workspace worktree location from backend app settings. */
export async function getDefaultWorktreeLocation() {
  const client = await getApiServiceClient();
  const response = await client.app.getDefaultWorktreeLocation(undefined);
  return response.worktreePath;
}

/** Checks whether one agent global config grants external directory access. */
export async function checkAgentGlobalConfigExternalDirectoryPermission(params?: { agentKind?: AgentKind }) {
  const client = await getApiServiceClient();
  return client.app.checkAgentGlobalConfigExternalDirectoryPermission(params ?? {});
}

/** Ensures one agent global config grants external directory access. */
export async function ensureAgentGlobalConfigExternalDirectoryPermission(params?: { agentKind?: AgentKind }) {
  const client = await getApiServiceClient();
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

/** Reads current desktop authentication status from main-process IPC. */
export async function getAuthStatus() {
  return await getDesktopHostBridge().getAuthStatus();
}

/** Reads current daemon identity and version from desktop main-process IPC. */
export async function getDaemonInfo() {
  return await getDesktopHostBridge().getDaemonInfo();
}

/** Runs one desktop login flow through main-process IPC. */
export async function login() {
  return await getDesktopHostBridge().login();
}
