import type { ExternalAppId } from "../../shared/contracts/externalApps";
import {
  computeUniqueGitChangeFileCount,
  countWorkspaceGitChanges,
  normalizeCreateWorkspaceInput,
  summarizeReconciledWorkspaceGitChangeTotals,
} from "../helpers/workspaceHelpers";
import { generateId } from "../helpers/generateId";
import { getDaemonClient } from "../rpc/rpcTransport";
import { layoutStore } from "../store/layoutStore";
import { sessionStore } from "../store/sessionStore";
import { tabStore } from "../store/tabStore";
import type { WorkspaceStoreState } from "../store/types";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import { workspaceFileTreeStore } from "../store/workspaceFileTreeStore";
import {
  type WorkspaceLifecycleScriptWarning,
  enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings,
} from "../store/workspaceLifecycleNoticeStore";
import { type WorkspaceRightPaneTab, workspacePaneStore } from "../store/workspacePaneStore";
import { workspaceStore } from "../store/workspaceStore";
import { ensureVisibleWorkspacesOpen } from "./daemonWorkspaceSync";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

type CreateWorkspaceInput = {
  projectId: string;
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

type CreateWorkspaceResponse = {
  workspaceId: string;
  projectId?: string;
  name: string;
  sourceBranch: string;
  branch: string;
  worktreePath: string;
  status: string;
  lifecycleScriptWarnings: WorkspaceLifecycleScriptWarning[];
  remoteSyncWarning?: string;
};

type CloseWorkspaceResponse = {
  workspace: { id: string; status: string };
  workspaceId: string;
  lifecycleScriptWarnings: WorkspaceLifecycleScriptWarning[];
  terminalCleanupErrors?: string[];
};

/**
 * Normalizes a raw lifecycle script warning from the daemon into the expected
 * shape. Handles both properly structured objects and legacy plain-string
 * warnings gracefully.
 */
function normalizeLifecycleWarning(
  raw: unknown,
  fallbackKind: "setup" | "post",
  fallbackCommand: string,
): WorkspaceLifecycleScriptWarning {
  if (typeof raw === "string") {
    return {
      scriptKind: fallbackKind,
      timedOut: false,
      message: raw,
      command: fallbackCommand,
      stdoutExcerpt: "",
      stderrExcerpt: "",
      exitCode: null,
      signal: null,
      logFilePath: null,
    };
  }

  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    scriptKind: record.scriptKind === "setup" || record.scriptKind === "post" ? record.scriptKind : fallbackKind,
    timedOut: Boolean(record.timedOut),
    message: typeof record.message === "string" ? record.message : "",
    command: typeof record.command === "string" && record.command ? record.command : fallbackCommand,
    stdoutExcerpt: typeof record.stdoutExcerpt === "string" ? record.stdoutExcerpt : "",
    stderrExcerpt: typeof record.stderrExcerpt === "string" ? record.stderrExcerpt : "",
    exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
    signal: typeof record.signal === "string" ? record.signal : null,
    logFilePath: typeof record.logFilePath === "string" ? record.logFilePath : null,
  };
}

/**
 * Enqueues in-app lifecycle script warning notices for one workspace.
 */
function notifyLifecycleScriptWarnings(
  workspaceName: string,
  warnings: WorkspaceLifecycleScriptWarning[] | undefined,
  fallbackKind: "setup" | "post",
  fallbackCommand: string,
): void {
  if (!warnings || warnings.length === 0) {
    return;
  }

  enqueueWorkspaceLifecycleWarnings({
    workspaceName,
    warnings: warnings.map((w) => normalizeLifecycleWarning(w, fallbackKind, fallbackCommand)),
  });
}

function formatWorkspaceCreateError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Workspace creation failed.";
  const daemonPrefixMatch = message.match(/^daemon RPC error -?\d+:\s*(.*)$/s);
  return daemonPrefixMatch?.[1]?.trim() || message;
}

function formatWorkspaceCloseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Workspace close failed.";
  const daemonPrefixMatch = message.match(/^daemon RPC error -?\d+:\s*(.*)$/s);
  return daemonPrefixMatch?.[1]?.trim() || message;
}

function notifyWorkspaceCloseFailure(input: { workspaceName?: string; error: unknown }): void {
  const workspaceName = input.workspaceName?.trim();
  const title = "Failed to close workspace";
  const workspaceLabel = workspaceName ? `Workspace \"${workspaceName}\"` : "The workspace";
  const message = `${workspaceLabel} was not closed. Try closing it again. ${formatWorkspaceCloseError(input.error)}`;

  enqueueWorkspaceErrorNotice({ title, message });
}

function isReauthRequiredRemoteSyncWarning(message: string): boolean {
  return /authenticated api session|refresh token|unauthorized|yishan login/i.test(message);
}

function createWorkspaceId(): string {
  return generateId();
}

const WORKSPACE_CREATE_STEP_DISPLAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function completeVisibleCreateProgressSteps(workspaceId: string): Promise<void> {
  for (const step of ["update", "worktree", "context", "setup"] as const) {
    const currentStep = workspaceCreateProgressStore
      .getState()
      .progressByWorkspaceId[workspaceId]?.steps.find((item) => item.id === step);
    if (!currentStep || currentStep.status === "completed" || currentStep.status === "skipped" || currentStep.status === "warning") {
      continue;
    }

    if (currentStep.status === "pending") {
      workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
        workspaceId,
        stepId: step,
        label: currentStep.label,
        status: "running",
        createdAt: new Date().toISOString(),
      });
      await delay(WORKSPACE_CREATE_STEP_DISPLAY_MS);
    }

    workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
      workspaceId,
      stepId: step,
      label: currentStep.label,
      status: "completed",
      createdAt: new Date().toISOString(),
    });
    await delay(WORKSPACE_CREATE_STEP_DISPLAY_MS);
  }
}

/** Runs backend workspace-close cleanup without blocking UI state updates. */
async function closeWorkspaceInBackground(input: {
  workspaceId: string;
  workspaceName: string;
  organizationId?: string;
  projectId?: string;
  workspaceWorktreePath?: string;
  branch?: string;
  removeBranch?: boolean;
  postHook?: string;
}): Promise<void> {
  const client = await getDaemonClient();

  const closed = (await client.workspace.close({
    workspaceId: input.workspaceId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    workspaceWorktreePath: input.workspaceWorktreePath,
    branch: input.branch,
    removeBranch: input.removeBranch,
    postHook: input.postHook,
  })) as CloseWorkspaceResponse | undefined;
  if (!closed) {
    return;
  }
  notifyLifecycleScriptWarnings(
    input.workspaceName,
    closed.lifecycleScriptWarnings,
    "post",
    input.postHook || "",
  );
  if (closed.terminalCleanupErrors && closed.terminalCleanupErrors.length > 0) {
    const details = closed.terminalCleanupErrors.join("; ");
    enqueueWorkspaceErrorNotice({
      title: "Some processes did not shut down cleanly",
      message: `Workspace "${input.workspaceName}" closed, but ${closed.terminalCleanupErrors.length} process(es) could not be terminated. Ports or resources may still be in use. Details: ${details}`,
    });
  }
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
export async function createWorkspace(input: CreateWorkspaceInput): Promise<string | undefined> {
  const store = readWorkspaceStoreState();
  const { normalizedName } = normalizeCreateWorkspaceInput(input);
  const projectId = input.projectId;

  if (!projectId || !normalizedName) {
    return;
  }

  const project = store.projects.find((item) => item.id === projectId);
  const organizationId = sessionStore.getState().selectedOrganizationId?.trim() || "";

  const repoKey = project?.repoKey?.trim() || project?.key?.trim() || project?.id || "";
  const sourcePath = project?.localPath?.trim() || project?.path?.trim() || "";
  const sourceBranch = input.sourceBranch?.trim() || "";
  const targetBranch = input.targetBranch?.trim() || sourceBranch;
  if (!organizationId || !repoKey || !sourcePath || !sourceBranch || !targetBranch) {
    console.error("Missing required workspace create input", {
      organizationId,
      projectId,
      hasRepoKey: Boolean(repoKey),
      hasSourcePath: Boolean(sourcePath),
      hasSourceBranch: Boolean(sourceBranch),
      hasTargetBranch: Boolean(targetBranch),
    });
    return;
  }

  const workspaceId = createWorkspaceId();
  workspaceCreateProgressStore.getState().startWorkspaceCreateProgress(workspaceId);
  store.addWorkspace({
    repoId: projectId,
    name: normalizedName,
    sourceBranch,
    branch: targetBranch,
    worktreePath: "",
    workspaceId,
    organizationId,
  });
  tabStore.getState().setSelectedWorkspaceId(workspaceId);
  const optimisticWorkspaceId = workspaceId;

  workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
    workspaceId: optimisticWorkspaceId,
    stepId: "update",
    label: "Fetch repository",
    status: "running",
    createdAt: new Date().toISOString(),
  });

  void (async () => {
    let backendWorkspace: BackendWorkspace | undefined;
    const client = await getDaemonClient();
    try {
      const created = (await client.workspace.createWorkspace({
        workspaceId,
        organizationId,
        projectId,
        repoKey,
        workspaceName: normalizedName,
        sourcePath,
        sourceBranch,
        targetBranch,
        contextEnabled: project?.contextEnabled ?? true,
        setupHook: project?.setupScript?.trim() || undefined,
      })) as CreateWorkspaceResponse;
      notifyLifecycleScriptWarnings(
        normalizedName,
        created.lifecycleScriptWarnings,
        "setup",
        project?.setupScript?.trim() || "",
      );
      if (created.remoteSyncWarning?.trim()) {
        const remoteSyncWarning = created.remoteSyncWarning.trim();
        const remoteSyncMessage = isReauthRequiredRemoteSyncWarning(remoteSyncWarning)
          ? `Remote sync needs re-authentication. Sign in again and retry sync from workspace actions. ${remoteSyncWarning}`
          : `Remote sync failed. Sign in again to sync this workspace. ${remoteSyncWarning}`;
        enqueueWorkspaceErrorNotice({
          title: "Workspace created locally",
          message: remoteSyncMessage,
        });
      }

      backendWorkspace = {
        id: optimisticWorkspaceId,
        projectId: created.projectId ?? projectId,
        name: created.name,
        sourceBranch: created.sourceBranch,
        branch: created.branch,
        worktreePath: created.worktreePath,
      };
    } catch (error) {
      workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
        workspaceId: optimisticWorkspaceId,
        stepId: "complete",
        label: "Prepare workspace",
        status: "failed",
        message: formatWorkspaceCreateError(error),
        createdAt: new Date().toISOString(),
      });
      console.error("Failed to create backend workspace worktree", error);
      enqueueWorkspaceErrorNotice({
        title: "Failed to create workspace",
        message: formatWorkspaceCreateError(error),
      });
    }

    if (!backendWorkspace?.id) {
      return;
    }

    readWorkspaceStoreState().addWorkspace({
      repoId: backendWorkspace.projectId,
      organizationId,
      workspaceId: optimisticWorkspaceId,
      name: backendWorkspace.name,
      sourceBranch: backendWorkspace.sourceBranch,
      branch: backendWorkspace.branch,
      worktreePath: backendWorkspace.worktreePath,
    });
    await completeVisibleCreateProgressSteps(optimisticWorkspaceId);
    workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
      workspaceId: optimisticWorkspaceId,
      stepId: "complete",
      label: "Prepare workspace",
      status: "completed",
      createdAt: new Date().toISOString(),
    });
    await delay(WORKSPACE_CREATE_STEP_DISPLAY_MS);
    workspaceCreateProgressStore.getState().finishWorkspaceCreateProgress(optimisticWorkspaceId);
    tabStore.getState().setSelectedWorkspaceId(readWorkspaceStoreState().selectedWorkspaceId);
  })().catch((error) => {
    console.error("Failed to create workspace in background", error);
  });

  return workspaceId;
}

/** Closes one workspace immediately in UI and schedules backend cleanup asynchronously. */
export async function closeWorkspace(workspaceId: string, options?: { removeBranch?: boolean }): Promise<void> {
  const store = readWorkspaceStoreState();
  const previousWorkspaces = store.workspaces;
  const workspace = store.workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    return;
  }

  const projectId = workspace.projectId ?? workspace.repoId;
  const project = store.projects.find((item) => item.id === projectId);

  store.closeWorkspace({
    repoId: projectId,
    workspaceId,
  });
  syncTabStoreWithWorkspace(previousWorkspaces);

  void closeWorkspaceInBackground({
    workspaceId,
    workspaceName: workspace.name,
    organizationId:
      workspace.organizationId?.trim() || sessionStore.getState().selectedOrganizationId?.trim() || undefined,
    projectId,
    workspaceWorktreePath: workspace.worktreePath?.trim() || undefined,
    branch: workspace.branch,
    removeBranch: options?.removeBranch,
    postHook: project?.postScript?.trim() || undefined,
  }).catch((error) => {
    console.error("Failed to close backend workspace", error);
    notifyWorkspaceCloseFailure({
      workspaceName: workspace.name,
      error,
    });
  });
}

/**
 * Resolves the normalized target branch (origin-prefixed) for a workspace,
 * matching the convention used by the Changes tab comparison.
 */
function resolveWorkspaceTargetBranch(workspaceId: string): string | undefined {
  const workspace = readWorkspaceStoreState().workspaces.find((ws) => ws.id === workspaceId);
  const sourceBranch = workspace?.sourceBranch?.trim();
  if (!sourceBranch) {
    return undefined;
  }
  if (sourceBranch.startsWith("origin/") || sourceBranch.includes("/")) {
    return sourceBranch;
  }
  return `origin/${sourceBranch}`;
}

/** Loads workspace git change sections and stores the aggregated count.
 *
 * The count combines:
 * 1. Uncommitted working-tree changes (staged + unstaged + untracked file count).
 * 2. Committed branch-diff changes against the workspace's source branch
 *    (files changed between merge-base and HEAD).
 *
 * The two sets are merged by unique file path so a file that appears in both
 * the branch diff and the working tree is only counted once.
 *
 * The totals (additions/deletions) similarly combine both sources.
 */
export async function refreshWorkspaceGitChanges(workspaceId: string, workspaceWorktreePath: string): Promise<void> {
  if (!workspaceId || !workspaceWorktreePath) {
    return;
  }

  try {
    const client = await getDaemonClient();
    const targetBranch = resolveWorkspaceTargetBranch(workspaceId);

    // Fetch uncommitted changes and (optionally) branch diff summary in parallel.
    const [sections, branchSummary] = await Promise.all([
      client.git.listChanges({ workspaceWorktreePath }),
      targetBranch
        ? client.git.getBranchDiffSummary({ workspaceWorktreePath, targetBranch }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const uncommittedCount = countWorkspaceGitChanges(sections);
    const uncommittedTotals = summarizeReconciledWorkspaceGitChangeTotals(sections);

    if (!branchSummary) {
      // No source branch configured — fall back to uncommitted-only count.
      readWorkspaceStoreState().setWorkspaceGitChangesCount(workspaceId, uncommittedCount);
      readWorkspaceStoreState().setWorkspaceGitChangeTotals(workspaceId, uncommittedTotals);
      return;
    }

    const combinedCount = computeUniqueGitChangeFileCount(branchSummary.files ?? [], sections);
    const combinedTotals = {
      additions: branchSummary.additions + uncommittedTotals.additions,
      deletions: branchSummary.deletions + uncommittedTotals.deletions,
    };

    readWorkspaceStoreState().setWorkspaceGitChangesCount(workspaceId, combinedCount);
    readWorkspaceStoreState().setWorkspaceGitChangeTotals(workspaceId, combinedTotals);
  } catch (error) {
    console.error("Failed to refresh workspace git changes", error);
  }
}

/** Stores visible repo ids for left-pane filtering state. */
export function setDisplayRepoIds(repoIds: string[]) {
  readWorkspaceStoreState().setDisplayProjectIds(repoIds);
  void ensureVisibleWorkspacesOpen();
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
  const selectedProjectId = state.selectedProjectId.trim();
  const selectedWorkspaceProjectId = state.workspaces.find(
    (workspace) => workspace.id === state.selectedWorkspaceId,
  )?.projectId;
  const selectedWorkspaceRepoId = state.workspaces.find(
    (workspace) => workspace.id === state.selectedWorkspaceId,
  )?.repoId;
  const fallbackProjectId = state.projects.find((project) => state.displayProjectIds.includes(project.id))?.id;
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
    const client = await getDaemonClient();
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
