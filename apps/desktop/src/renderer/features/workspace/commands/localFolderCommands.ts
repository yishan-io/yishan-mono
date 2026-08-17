import { LOCAL_FOLDER_PROJECT_ID } from "../../../features/project/model/projectTypes";
import { resolveTabForWorkspace } from "../../../features/workbench/commands/tabCommands";
import { syncTabStoreWithWorkspace } from "../../../features/workbench/commands/workspaceTabSync";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import { workspaceUiStore } from "../../../features/workspace/state/workspaceUiStore";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import { isFolderWorkspace } from "../../../helpers/localFolder";
import type { DaemonLocalFolder } from "../../../rpc/daemonTypes";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { buildWorkspaceOpenProjectEntries, openWorkspaceEntries } from "./workspaceWarmupCommand";

/**
 * Creates a non-git local folder workspace via the daemon, applies it to the
 * workspace store, and opens it like an imported primary workspace. V1 folders
 * are org-independent with no backend record or context link (see createProject).
 */
export async function createLocalFolderImport(input: { path: string; name: string }): Promise<void> {
  let folder: DaemonLocalFolder;
  try {
    const client = await getDaemonClient();
    folder = await client.workspace.createLocalFolder({
      path: input.path,
      name: input.name,
    });
  } catch (error) {
    console.error("Failed to create local folder workspace", error);
    throw new Error(getErrorMessage(error));
  }

  if (!folder?.id) {
    throw new Error("Daemon local folder response is empty");
  }

  workspaceStore.getState().addLocalFolder(folder);

  // Select the newly created folder (mirrors the remote create flow setting
  // selection via applyCreatedWorkspaceState) so the tab resolves against the
  // new folder instead of the previous selection.
  workspaceStore.getState().setSelectedWorkspaceId(folder.id);
  workspaceStore.getState().setSelectedProjectId(LOCAL_FOLDER_PROJECT_ID);

  const folderWorkspace = workspaceStore.getState().workspaces.find((w) => w.id === folder.id);
  const openEntries = buildWorkspaceOpenProjectEntries(folderWorkspace ? [folderWorkspace] : [], "");
  await openWorkspaceEntries(openEntries);
  // Refresh only the file tree (folders have no git changes to refresh).
  for (const entry of openEntries) {
    workspaceUiStore.getState().incrementFileTreeRefreshVersion(entry.worktreePath, []);
  }

  // Read selection after setting it so the folder's id is what gets resolved.
  resolveTabForWorkspace(workspaceStore.getState().selectedWorkspaceId);
}

/**
 * Opens all given local folders on the daemon on demand. The daemon's
 * workspace.openProject is idempotent and skips already-open workspaces, so
 * repeated snapshot loads only open folders that are not yet registered in the
 * runtime manager. Failures are logged but do not throw so a folder open failure
 * never blocks the surrounding snapshot load.
 */
export async function openFoldersForSnapshot(folders: DaemonLocalFolder[], organizationId: string): Promise<void> {
  const folderEntries = buildWorkspaceOpenProjectEntries(
    (folders ?? []).map((folder) => ({
      id: folder.id,
      projectId: LOCAL_FOLDER_PROJECT_ID,
      worktreePath: folder.path ?? "",
    })),
    organizationId,
  );
  if (folderEntries.length === 0) {
    return;
  }
  try {
    await openWorkspaceEntries(folderEntries);
  } catch (error) {
    console.error("Failed to open local folder workspaces on daemon", error);
  }
}

/**
 * Restores the previously selected workspace when it was a local folder and
 * the folder still exists after a snapshot reload. workspaceStore.load() rebuilds
 * workspaces[] without folder items and loses a folder selection to the fallback,
 * so after loadLocalFolders() re-adds the folder rows we restore the selection
 * back to the folder the user was viewing.
 */
export function restoreFolderSelectionIfNeeded(
  previousWorkspaces: Array<{ id: string; projectId?: string; kind?: string }>,
  previousSelectedWorkspaceId: string,
): void {
  const previousSelected = previousWorkspaces.find((w) => w.id === previousSelectedWorkspaceId);
  if (previousSelectedWorkspaceId && isFolderWorkspace(previousSelected)) {
    if (workspaceStore.getState().workspaces.some((w) => w.id === previousSelectedWorkspaceId)) {
      workspaceStore.getState().setSelectedWorkspaceId(previousSelectedWorkspaceId);
    }
  }
}

/** Deletes one local folder workspace on the daemon, then removes it from store state. */
export async function deleteLocalFolder(id: string): Promise<void> {
  const folderId = id.trim();
  if (!folderId) {
    return;
  }

  const previousWorkspaces = workspaceStore.getState().workspaces;
  try {
    await (await getDaemonClient()).workspace.deleteLocalFolder({ id: folderId });
  } catch (error) {
    console.error("Failed to delete local folder", error);
    throw new Error(getErrorMessage(error));
  }

  workspaceStore.getState().removeLocalFolder(folderId);
  syncTabStoreWithWorkspace(previousWorkspaces);
}
