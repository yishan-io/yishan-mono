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
import { resolveWorkspaceAfterClose } from "./workspaceCloseSelection";
import { buildWorkspaceOpenProjectEntries, openWorkspaceEntries } from "./workspaceWarmupCommand";

/**
 * Applies a daemon-created non-git local folder to the workspace store and opens
 * it like an imported primary workspace. Folders are org-independent.
 */
export async function applyLocalFolderImport(folder: DaemonLocalFolder): Promise<void> {
  if (!folder?.id) {
    throw new Error("Daemon local folder response is empty");
  }

  workspaceStore.getState().addLocalFolder(folder);

  // This pure entry construction is the only synchronous work before the
  // awaited workspace.openProject request below.
  const folderWorkspace = workspaceStore.getState().workspaces.find((workspace) => workspace.id === folder.id);
  const openEntries = buildWorkspaceOpenProjectEntries(folderWorkspace ? [folderWorkspace] : [], "");
  await openWorkspaceEntries(openEntries);
  for (const entry of openEntries) {
    incrementFileTreeRefreshVersion(entry.worktreePath, []);
  }
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
      kind: "folder",
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

  const previousWorkspaces = [...workspaceStore.getState().workspaces];
  try {
    const workspaceRpc = await getWorkspaceRpc();
    await workspaceRpc.deleteLocalFolder({ id: folderId });
  } catch (error) {
    console.error("Failed to delete local folder", error);
    throw new Error(getErrorMessage(error));
  }

  const currentWorkspaceState = workspaceStore.getState();
  const currentWorkspaces = [...currentWorkspaceState.workspaces];
  const orderedWorkspaceIds = [...currentWorkspaceState.orderedWorkspaceIds];
  const activeWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;
  workspaceStore.getState().removeLocalFolder(folderId);

  if (activeWorkspaceId === folderId) {
    const replacementWorkspace = resolveWorkspaceAfterClose({
      closingWorkspaceId: folderId,
      orderedWorkspaceIds,
      preCloseWorkspaces: currentWorkspaces,
    });
    if (replacementWorkspace) {
      activateWorkspace({
        workspaceId: replacementWorkspace.id,
        projectId: replacementWorkspace.projectId ?? replacementWorkspace.repoId,
      });
    } else {
      workbenchNavigationStore.getState().setActiveWorkspaceId("");
    }
  }

  await syncTabStoreWithWorkspace(previousWorkspaces);
}
