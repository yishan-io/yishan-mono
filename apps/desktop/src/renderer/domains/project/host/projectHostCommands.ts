import { getDesktopHostBridge } from "@renderer/platform/hostBridge";

/**
 * Project host boundary — Electron host I/O for project worktree paths.
 *
 * Owned by the Project Domain (desktop8 domain rules). Host operations that
 * serve project worktree selection; the daemon-side worktree-location read
 * lives in `daemon/projectDaemonClient`. They were previously App commands;
 * only project code uses them, so they live in the project host boundary.
 */

/** Opens one native folder picker and returns a selected directory path when available. */
export async function openLocalFolderDialog(startingFolder?: string) {
  return await getDesktopHostBridge().openLocalFolderDialog({ startingFolder });
}
