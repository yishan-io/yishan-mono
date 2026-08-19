import { incrementFileTreeRefreshVersion } from "@renderer/domains/files";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { activateWorkspace } from "@renderer/domains/workbench";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { syncTabStoreWithWorkspace } from "../../../domains/workspace/commands/workspaceTabSync";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { getWorkspaceRpc } from "../daemon/daemonWorkspaceClient";
import { isFolderWorkspace } from "../local-folder/localFolder";
import type { DaemonLocalFolder } from "../local-folder/snapshotTypes";
import { buildWorkspaceOpenProjectEntries, openWorkspaceEntries } from "./workspaceWarmupCommand";

/**
 * Creates a non-git local folder workspace via the daemon, applies it to the
 * workspace store, and opens it like an imported primary workspace. V1 folders
 * are org-independent with no backend record or context link (see createProject).
 */
export async function createLocalFolderImport(input: { path: string; name: string }): Promise<void> {
  let folder: DaemonLocalFolder;
  try {
    const workspaceRpc = await getWorkspaceRpc();
    folder = await workspaceRpc.createLocalFolder({
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
  const folderWorkspace = workspaceStore.getState().workspaces.find((w) => w.id === folder.id);
  const openEntries = buildWorkspaceOpenProjectEntries(folderWorkspace ? [folderWorkspace] : [], "");
  await openWorkspaceEntries(openEntries);
  // Refresh only the file tree (folders have no git changes to refresh).
  for (const entry of openEntries) {
    incrementFileTreeRefreshVersion(entry.worktreePath, []);
  }

  // The folder row is already in the store; activate it through the Workbench
  // navigation command so the active context and tab both update.
  activateWorkspace({ workspaceId: folder.id, projectId: LOCAL_FOLDER_PROJECT_ID });
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
      activateWorkspace({ workspaceId: previousSelectedWorkspaceId, projectId: LOCAL_FOLDER_PROJECT_ID });
    }
  }
}

/** Lists all local folder workspaces registered on the daemon. */
export async function listLocalFolders(): Promise<DaemonLocalFolder[]> {
  const workspaceRpc = await getWorkspaceRpc();
  return await workspaceRpc.listLocalFolders();
}

/** Deletes one local folder workspace on the daemon, then removes it from store state. */
export async function deleteLocalFolder(id: string): Promise<void> {
  const folderId = id.trim();
  if (!folderId) {
    return;
  }

  const previousWorkspaces = workspaceStore.getState().workspaces;
  try {
    const workspaceRpc = await getWorkspaceRpc();
    await workspaceRpc.deleteLocalFolder({ id: folderId });
  } catch (error) {
    console.error("Failed to delete local folder", error);
    throw new Error(getErrorMessage(error));
  }

  workspaceStore.getState().removeLocalFolder(folderId);
  await syncTabStoreWithWorkspace(previousWorkspaces);

  // The deleted folder may have been the active workspace; re-activate the
  // remaining selection through the Workbench navigation command.
  const remainingWorkspaces = workspaceStore.getState().workspaces;
  const activeWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
  if (activeWorkspaceId === folderId) {
    const nextFolderWorkspace = remainingWorkspaces.find(
      (workspace) => workspace.projectId === LOCAL_FOLDER_PROJECT_ID,
    );
    const nextWorkspaceId = nextFolderWorkspace?.id ?? remainingWorkspaces[0]?.id ?? "";
    activateWorkspace({ workspaceId: nextWorkspaceId, projectId: LOCAL_FOLDER_PROJECT_ID });
  }
}
