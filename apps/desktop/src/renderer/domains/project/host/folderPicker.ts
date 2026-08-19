import { getDesktopHostBridge } from "@renderer/platform/hostBridge";

/**
 * Project host boundary — native folder picker for project worktree paths.
 *
 * A host adapter, not a Command: it forwards one call to the Electron host
 * bridge so Features never touch the raw transport (desktop8 domain rules).
 * The daemon-side worktree-location read lives in `daemon/projectDaemonClient`.
 */

/** Opens one native folder picker and returns a selected directory path when available. */
export async function openLocalFolderDialog(startingFolder?: string) {
  return await getDesktopHostBridge().openLocalFolderDialog({ startingFolder });
}
