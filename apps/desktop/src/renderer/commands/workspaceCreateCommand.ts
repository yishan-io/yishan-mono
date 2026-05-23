import { delay } from "../helpers/delay";
import { generateId } from "../helpers/generateId";
import { normalizeCreateWorkspaceInput } from "../helpers/workspaceHelpers";
import { getDaemonClient } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";
import { tabStore } from "../store/tabStore";
import type { WorkspaceStoreState } from "../store/types";
import { workspaceCreateProgressStore } from "../store/workspaceCreateProgressStore";
import {
  type WorkspaceLifecycleScriptWarning,
  enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings,
} from "../store/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../store/workspaceStore";

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

type WorkspaceStoreFacade = typeof workspaceStore & {
  getState?: () => WorkspaceStoreState;
};

const WORKSPACE_CREATE_STEP_DISPLAY_MS = 200;

function createWorkspaceId(): string {
  return generateId();
}

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
export function notifyLifecycleScriptWarnings(
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

function isReauthRequiredRemoteSyncWarning(message: string): boolean {
  return /authenticated api session|refresh token|unauthorized|yishan login/i.test(message);
}

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

async function completeVisibleCreateProgressSteps(workspaceId: string): Promise<void> {
  for (const step of ["worktree", "context", "setup"] as const) {
    const currentStep = workspaceCreateProgressStore
      .getState()
      .progressByWorkspaceId[workspaceId]?.steps.find((item) => item.id === step);
    if (
      !currentStep ||
      currentStep.status === "completed" ||
      currentStep.status === "skipped" ||
      currentStep.status === "warning"
    ) {
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
        id: workspaceId,
        projectId: created.projectId ?? projectId,
        name: created.name,
        sourceBranch: created.sourceBranch,
        branch: created.branch,
        worktreePath: created.worktreePath,
      };
    } catch (error) {
      // Mark any step still showing as "running" as failed so the UI doesn't
      // stay stuck with a spinning indicator forever.
      const progressState = workspaceCreateProgressStore.getState().progressByWorkspaceId[workspaceId];
      if (progressState) {
        for (const step of progressState.steps) {
          if (step.status === "running") {
            workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
              workspaceId,
              stepId: step.id,
              label: step.label,
              status: "failed",
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
      workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
        workspaceId,
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
      workspaceId,
      name: backendWorkspace.name,
      sourceBranch: backendWorkspace.sourceBranch,
      branch: backendWorkspace.branch,
      worktreePath: backendWorkspace.worktreePath,
    });
    await completeVisibleCreateProgressSteps(workspaceId);
    workspaceCreateProgressStore.getState().applyWorkspaceCreateProgressEvent({
      workspaceId,
      stepId: "complete",
      label: "Prepare workspace",
      status: "completed",
      createdAt: new Date().toISOString(),
    });
    await delay(WORKSPACE_CREATE_STEP_DISPLAY_MS);
    workspaceCreateProgressStore.getState().finishWorkspaceCreateProgress(workspaceId);
  })().catch((error) => {
    console.error("Failed to create workspace in background", error);
  });

  return workspaceId;
}
