import { getDaemonClient, getDesktopHostBridge } from "../../../rpc/rpcTransport";

/**
 * Project host commands — external I/O for project worktree paths.
 *
 * Owned by the Project Domain (Domains plan D6). These are host-boundary
 * operations (Electron folder picker, daemon app settings) that serve project
 * worktree selection. They were previously App commands; only project code
 * uses them, so they belong to project infrastructure.
 */

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
