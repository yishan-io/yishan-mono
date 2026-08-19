import { resolveExplicitWorkspaceDisplayMetadata } from "../naming/workspaceDisplayNames";
import type { WorkspaceStoreState } from "./workspaceStoreTypes";

type WorkspaceStoreSlice = Pick<WorkspaceStoreState, "workspaces"> & {
  pullRequestByWorkspaceId?: Record<string, unknown>;
  gitChangesCountByWorkspaceId?: Record<string, unknown>;
  gitChangeTotalsByWorkspaceId?: Record<string, unknown>;
};

function resolveWorkspaceProjectId(workspace: { projectId?: string; repoId: string }): string {
  return workspace.projectId ?? workspace.repoId;
}

/** Returns normalized workspace naming and branch values. */
export function normalizeCreateWorkspaceInput(input: {
  name: string;
}): {
  normalizedName: string;
  normalizedBranch: string;
} {
  const normalizedName = input.name.trim();
  return {
    normalizedName,
    normalizedBranch: "main",
  };
}

/** Applies a newly created workspace to the draft state and updates selection. */
export function applyCreatedWorkspaceState(
  state: WorkspaceStoreSlice,
  input: {
    projectId: string;
    normalizedName: string;
    normalizedBranch: string;
    backendWorkspace: {
      workspaceId: string;
      organizationId?: string;
      name: string;
      sourceBranch: string;
      branch: string;
      worktreePath: string;
      nodeId?: string;
      status?: WorkspaceStoreState["workspaces"][number]["status"];
      preserveOnMissingSnapshot?: boolean;
    };
  },
): void {
  const nextWorkspaceId = input.backendWorkspace.workspaceId;
  const displayMetadata = resolveExplicitWorkspaceDisplayMetadata(input.backendWorkspace.name || input.normalizedName);
  const nextWorkspace = {
    id: nextWorkspaceId,
    organizationId: input.backendWorkspace.organizationId,
    projectId: input.projectId,
    repoId: input.projectId,
    name: displayMetadata.name,
    title: displayMetadata.title,
    sourceBranch: input.backendWorkspace.sourceBranch || "",
    branch: input.backendWorkspace.branch || input.normalizedBranch,
    summaryId: nextWorkspaceId,
    worktreePath: input.backendWorkspace.worktreePath,
    nodeId: input.backendWorkspace.nodeId,
    status: input.backendWorkspace.status,
    ...(input.backendWorkspace.preserveOnMissingSnapshot ? { preserveOnMissingSnapshot: true } : {}),
  };
  const existingWorkspaceIndex = state.workspaces.findIndex((workspace) => workspace.id === nextWorkspaceId);
  if (existingWorkspaceIndex >= 0) {
    const existing = state.workspaces[existingWorkspaceIndex];
    if (existing) {
      Object.assign(existing, nextWorkspace);
    }
  } else {
    state.workspaces.push(nextWorkspace);
  }
}

/** Removes one workspace from draft state. */
export function applyDeletedWorkspaceState(
  state: WorkspaceStoreSlice,
  input: { projectId: string; workspaceId: string },
): void {
  const removedIndex = state.workspaces.findIndex((workspace) => workspace.id === input.workspaceId);
  if (removedIndex >= 0) {
    state.workspaces.splice(removedIndex, 1);
  }

  delete state.gitChangesCountByWorkspaceId?.[input.workspaceId];
  delete state.gitChangeTotalsByWorkspaceId?.[input.workspaceId];
  delete state.pullRequestByWorkspaceId?.[input.workspaceId];
}

/** Applies a workspace rename to the matching workspace in draft state. */
export function applyRenamedWorkspaceState(
  state: Pick<WorkspaceStoreState, "workspaces">,
  input: { projectId: string; workspaceId: string; normalizedName: string },
): void {
  const workspace = state.workspaces.find(
    (workspace) => workspace.id === input.workspaceId && resolveWorkspaceProjectId(workspace) === input.projectId,
  );
  if (workspace) {
    workspace.name = input.normalizedName;
    workspace.title = input.normalizedName;
  }
}

/** Applies a workspace branch rename to the matching workspace in draft state. */
export function applyRenamedWorkspaceBranchState(
  state: Pick<WorkspaceStoreState, "workspaces">,
  input: { projectId: string; workspaceId: string; normalizedBranch: string },
): void {
  const workspace = state.workspaces.find(
    (workspace) => workspace.id === input.workspaceId && resolveWorkspaceProjectId(workspace) === input.projectId,
  );
  if (workspace) {
    workspace.branch = input.normalizedBranch;
  }
}

/** Counts changed files from staged, unstaged, and untracked groups. */
