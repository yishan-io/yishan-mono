import type { ExternalAppId } from "../../shared/contracts/externalApps";
import {
  countWorkspaceGitChanges,
  normalizeCreateWorkspaceInput,
  summarizeWorkspaceGitChangeTotals,
} from "../helpers/workspaceHelpers";
import { getApiServiceClient } from "../rpc/rpcTransport";
import { layoutStore } from "../store/layoutStore";
import { tabStore } from "../store/tabStore";
import type { WorkspaceStoreState } from "../store/types";
import { workspaceFileTreeStore } from "../store/workspaceFileTreeStore";
import {
  type WorkspaceLifecycleScriptWarning,
  enqueueWorkspaceLifecycleWarnings,
} from "../store/workspaceLifecycleNoticeStore";
import { type WorkspaceRightPaneTab, workspacePaneStore } from "../store/workspacePaneStore";
import { workspaceStore } from "../store/workspaceStore";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

type CreateWorkspaceInput = {
  projectId?: string;
  repoId?: string;
  name: string;
  sourceBranch?: string;
  targetBranch?: string;
};

type BackendWorkspace = {
  id: string;
  projectId: string;
  name: string;
  sourceBranch: string;
  branch: string;
  worktreePath: string;
};

type WorkspaceListResponse = Array<{
  id: string;
  projectId?: string | null;
  repositoryId?: string | null;
  instance: {
    workspaceId: string;
    repoId: string;
    projectId?: string;
    name: string;
    sourceBranch: string;
    branch: string;
    worktreePath: string;
    status: string;
  } | null;
}>;

type CreateWorkspaceResponse = {
  workspace: { id: string };
  workspaceInstance: {
    workspaceId: string;
    repoId: string;
    projectId?: string;
    name: string;
    sourceBranch: string;
    branch: string;
    worktreePath: string;
    status: string;
  } | null;
  lifecycleScriptWarnings: WorkspaceLifecycleScriptWarning[];
};

type CloseWorkspaceResponse = {
  workspace: { id: string; status: string };
  workspaceId: string;
  lifecycleScriptWarnings: WorkspaceLifecycleScriptWarning[];
};

/**
 * Enqueues in-app lifecycle script warning notices for one workspace.
 */
function notifyLifecycleScriptWarnings(
  workspaceName: string,
  warnings: WorkspaceLifecycleScriptWarning[] | undefined,
): void {
  if (!warnings || warnings.length === 0) {
    return;
  }

  enqueueWorkspaceLifecycleWarnings({
    workspaceName,
    warnings,
  });
}

/**
 * Resolves one workspace id from one workspace-instance id through overview rows.
 */
function resolveWorkspaceIdByInstanceId(workspaces: WorkspaceListResponse, workspaceId: string): string | undefined {
  for (const item of workspaces) {
    if (item.instance?.workspaceId === workspaceId) {
      return item.id;
    }
  }

  return undefined;
}

/** Resolves one backend workspace id from one workspace-instance id. */
async function resolveBackendWorkspaceId(
  client: Awaited<ReturnType<typeof getApiServiceClient>>,
  workspaceId: string,
): Promise<string | undefined> {
  const workspaces = (await client.workspace.list({
    orgId: "default",
  })) as WorkspaceListResponse;
  return resolveWorkspaceIdByInstanceId(workspaces, workspaceId);
}

/** Runs backend workspace-close cleanup without blocking UI state updates. */
async function closeWorkspaceInBackground(input: {
  workspaceId: string;
  workspaceName: string;
  removeBranch?: boolean;
}): Promise<void> {
  const client = await getApiServiceClient();

  const backendWorkspaceId = await resolveBackendWorkspaceId(client, input.workspaceId);
  if (!backendWorkspaceId) {
    return;
  }

  const closed = (await client.workspace.close({
    workspaceId: backendWorkspaceId,
    removeBranch: input.removeBranch,
  })) as CloseWorkspaceResponse | undefined;
  if (!closed) {
    return;
  }
  notifyLifecycleScriptWarnings(input.workspaceName, closed.lifecycleScriptWarnings);
}

type WorkspaceStoreFacade = typeof workspaceStore & {
  getState?: () => WorkspaceStoreState;
};

export const OPEN_CREATE_WORKSPACE_DIALOG_EVENT = "workspace:open-create-workspace-dialog";

type OpenCreateWorkspaceDialogDetail = {
  projectId: string;
  repoId?: string;
};

/** Reads workspace store state for both real Zustand stores and selector-only test doubles. */
function readWorkspaceStoreState(): WorkspaceStoreState {
  const facade = workspaceStore as WorkspaceStoreFacade;
  if (typeof facade.getState === "function") {
    return facade.getState();
  }

  return (
    workspaceStore as unknown as (selector: (state: WorkspaceStoreState) => WorkspaceStoreState) => WorkspaceStoreState
  )((state) => state);
}

/** Creates one workspace by calling backend service when available, then appending it in store state. */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<void> {
  const store = readWorkspaceStoreState();
  const { normalizedName } = normalizeCreateWorkspaceInput(input);
  const projectId = input.projectId ?? input.repoId ?? "";

  if (!projectId || !normalizedName) {
    return;
  }

  const project = store.projects.find((item) => item.id === projectId) ?? store.repos.find((item) => item.id === projectId);

  let backendWorkspace: BackendWorkspace | undefined;

  if (project?.localPath) {
    const client = await getApiServiceClient();
    try {
      const created = (await client.workspace.create({
        orgId: "default",
        repositoryId: projectId,
        workspaceName: normalizedName,
        sourceBranch: input.sourceBranch?.trim() || undefined,
        targetBranch: input.targetBranch?.trim() || undefined,
        workspaceWorktreePath: project.worktreePath,
      })) as CreateWorkspaceResponse;
      notifyLifecycleScriptWarnings(normalizedName, created.lifecycleScriptWarnings);

      const linkedWorkspace = created.workspaceInstance;
      if (linkedWorkspace) {
        backendWorkspace = {
          id: linkedWorkspace.workspaceId,
          projectId: linkedWorkspace.projectId ?? linkedWorkspace.repoId,
          name: linkedWorkspace.name,
          sourceBranch: linkedWorkspace.sourceBranch,
          branch: linkedWorkspace.branch,
          worktreePath: linkedWorkspace.worktreePath,
        };
      }
    } catch (error) {
      console.error("Failed to create backend workspace worktree", error);
    }
  }

  if (!backendWorkspace?.id) {
    return;
  }

  store.addWorkspace({
    repoId: backendWorkspace.projectId,
    name: backendWorkspace.name,
    sourceBranch: backendWorkspace.sourceBranch,
    branch: backendWorkspace.branch,
    worktreePath: backendWorkspace.worktreePath,
    workspaceId: backendWorkspace.id,
  });
  tabStore.getState().setSelectedWorkspaceId(readWorkspaceStoreState().selectedWorkspaceId);
}

/** Closes one workspace immediately in UI and schedules backend cleanup asynchronously. */
export async function closeWorkspace(workspaceId: string, options?: { removeBranch?: boolean }): Promise<void> {
  const store = readWorkspaceStoreState();
  const previousWorkspaces = store.workspaces;
  const workspace = store.workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    return;
  }

  store.deleteWorkspace({
    repoId: workspace.projectId ?? workspace.repoId,
    workspaceId,
  });
  syncTabStoreWithWorkspace(previousWorkspaces);

  void closeWorkspaceInBackground({
    workspaceId,
    workspaceName: workspace.name,
    removeBranch: options?.removeBranch,
  }).catch((error) => {
    console.error("Failed to close backend workspace", error);
  });
}

/** Loads workspace git change sections and stores the aggregated count. */
export async function refreshWorkspaceGitChanges(workspaceId: string, workspaceWorktreePath: string): Promise<void> {
  if (!workspaceId || !workspaceWorktreePath) {
    return;
  }

  try {
    const client = await getApiServiceClient();
    const sections = await client.git.listChanges({
      workspaceWorktreePath,
    });
    const count = countWorkspaceGitChanges(sections);
    const totals = summarizeWorkspaceGitChangeTotals(sections);
    readWorkspaceStoreState().setWorkspaceGitChangesCount(workspaceId, count);
    readWorkspaceStoreState().setWorkspaceGitChangeTotals(workspaceId, totals);
  } catch (error) {
    console.error("Failed to refresh workspace git changes", error);
  }
}

/** Stores visible repo ids for left-pane filtering state. */
export function setDisplayRepoIds(repoIds: string[]) {
  readWorkspaceStoreState().setDisplayRepoIds(repoIds);
}

/** Stores last used external app id for quick-open actions. */
export function setLastUsedExternalAppId(appId: ExternalAppId) {
  readWorkspaceStoreState().setLastUsedExternalAppId(appId);
}

/** Sets left pane width in workspace layout state. */
export function setLeftPaneWidth(width: number) {
  layoutStore.getState().setLeftWidth(width);
}

/** Sets right pane width in workspace layout state. */
export function setRightPaneWidth(width: number) {
  layoutStore.getState().setRightWidth(width);
}

/** Toggles left workspace pane manual visibility state. */
export function toggleLeftPaneVisibility() {
  const state = layoutStore.getState();
  state.setIsLeftPaneManuallyHidden(!state.isLeftPaneManuallyHidden);
}

/** Toggles right workspace pane manual visibility state. */
export function toggleRightPaneVisibility() {
  const state = layoutStore.getState();
  state.setIsRightPaneManuallyHidden(!state.isRightPaneManuallyHidden);
}

/** Activates one workspace pane and makes sure the owning sidebar is visible. */
export function activateWorkspacePane(pane: "repo" | WorkspaceRightPaneTab) {
  if (pane === "repo") {
    layoutStore.getState().setIsLeftPaneManuallyHidden(false);
    return;
  }

  layoutStore.getState().setIsRightPaneManuallyHidden(false);
  workspacePaneStore.getState().setRightPaneTab(pane);
}

/** Requests opening the create-workspace dialog for the currently selected project context. */
export function openCreateWorkspaceDialog() {
  if (typeof window === "undefined") {
    return;
  }

  const state = readWorkspaceStoreState();
  const selectedProjectId = state.selectedProjectId.trim() || state.selectedRepoId.trim();
  const selectedWorkspaceProjectId = state.workspaces.find(
    (workspace) => workspace.id === state.selectedWorkspaceId,
  )?.projectId;
  const selectedWorkspaceRepoId = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId)?.repoId;
  const fallbackProjectId =
    (state.projects ?? state.repos).find((project) => (state.displayProjectIds ?? state.displayRepoIds).includes(project.id))
      ?.id;
  const projectId = selectedProjectId || selectedWorkspaceProjectId || selectedWorkspaceRepoId || fallbackProjectId;

  if (!projectId) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenCreateWorkspaceDialogDetail>(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, {
      detail: { projectId, repoId: projectId },
    }),
  );
}

/** Focuses the repo file-tree area after making the files pane visible. */
export function focusWorkspaceFileTree() {
  activateWorkspacePane("files");

  if (typeof document === "undefined") {
    return;
  }

  const focusFileTreeArea = () => {
    if (typeof document === "undefined") {
      return false;
    }

    const fileTreeArea = document.querySelector<HTMLElement>('[data-testid="repo-file-tree-area"]');
    if (!fileTreeArea) {
      return false;
    }

    const activeTreeItem = fileTreeArea.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
    if (activeTreeItem) {
      activeTreeItem.focus();
      return true;
    }

    fileTreeArea.focus();
    return true;
  };

  focusFileTreeArea();
  requestAnimationFrame(() => {
    focusFileTreeArea();
  });
  setTimeout(() => {
    focusFileTreeArea();
  }, 16);
}

/** Opens workspace file search without changing file-tree pane visibility state. */
export function openWorkspaceFileSearch() {
  workspacePaneStore.getState().requestFileSearch();
}

/** Requests deletion of the currently selected file-tree entry. */
export function deleteSelectedFileTreeEntry() {
  workspaceFileTreeStore.getState().requestDeleteSelection();
}

/** Requests undo of the latest file-tree operation. */
export function undoFileTreeOperation() {
  workspaceFileTreeStore.getState().requestUndo();
}

/** Renames one workspace in renderer store state. */
export function renameWorkspace(input: { projectId?: string; repoId?: string; workspaceId: string; name: string }) {
  const projectId = input.projectId ?? input.repoId ?? "";
  if (!projectId) {
    return;
  }

  if (input.projectId) {
    readWorkspaceStoreState().renameWorkspace({
      ...input,
      projectId,
      repoId: projectId,
    });
    return;
  }

  readWorkspaceStoreState().renameWorkspace({
    repoId: projectId,
    workspaceId: input.workspaceId,
    name: input.name,
  });
}

/** Renames one managed workspace branch in git and mirrors the new branch in renderer store state. */
export async function renameWorkspaceBranch(input: {
  projectId?: string;
  repoId?: string;
  workspaceId: string;
  branch: string;
}) {
  const normalizedBranch = input.branch.trim();
  const projectId = input.projectId ?? input.repoId ?? "";
  if (!projectId || !input.workspaceId || !normalizedBranch) {
    return;
  }

  const store = readWorkspaceStoreState();
  const workspace = store.workspaces.find(
    (item) => item.id === input.workspaceId && (item.projectId ?? item.repoId) === projectId && item.kind !== "local",
  );
  if (!workspace) {
    return;
  }

  const workspaceWorktreePath = workspace.worktreePath?.trim();
  if (!workspaceWorktreePath || workspace.branch === normalizedBranch) {
    return;
  }

  try {
    const client = await getApiServiceClient();
    await client.git.renameBranch({
      workspaceWorktreePath,
      nextBranch: normalizedBranch,
    });
    store.renameWorkspaceBranch({
      repoId: projectId,
      workspaceId: input.workspaceId,
      branch: normalizedBranch,
    });
  } catch (error) {
    console.error("Failed to rename workspace branch", error);
    throw error;
  }
}
