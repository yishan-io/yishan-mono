import { LOCAL_FOLDER_PROJECT_ID } from "../store/types";

/** A minimal duck-typed workspace row sufficient to identify a folder. */
type FolderCandidate =
  | {
      kind?: string;
      projectId?: string;
    }
  | null
  | undefined;

/**
 * Single gate deciding whether a workspace row is a local (non-git) folder
 * workspace.
 *
 * Folder workspaces are daemon-owned rows (kind="folder") mapped into the
 * workspace list with the sentinel project id, but they have no real backend
 * project in `projects[]`. They must always resolve to git-incapable so no
 * git surface (changes/PR tabs, branch dropdowns, git polling, create-workspace
 * dialog, PR refresh) ever fires for them.
 */
export function isFolderWorkspace(workspace: FolderCandidate): boolean {
  return workspace?.kind === "folder" || workspace?.projectId === LOCAL_FOLDER_PROJECT_ID;
}
