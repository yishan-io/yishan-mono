import type { WorkspaceStoreState } from "../store/types";

type WorkspaceStoreSlice = Pick<
  WorkspaceStoreState,
  | "projects"
  | "workspaces"
  | "selectedProjectId"
  | "selectedWorkspaceId"
  | "gitChangesCountByWorkspaceId"
  | "gitChangeTotalsByWorkspaceId"
>;

function resolveWorkspaceProjectId(workspace: { projectId?: string; repoId: string }): string {
  return workspace.projectId ?? workspace.repoId;
}

/** Returns normalized workspace naming and branch values. */
export function normalizeCreateWorkspaceInput(input: {
  name: string;
}): {
  normalizedName: string;
  normalizedTitle: string;
  normalizedBranch: string;
} {
  const normalizedName = input.name.trim();
  return {
    normalizedName,
    normalizedTitle: normalizedName,
    normalizedBranch: "main",
  };
}

/** Builds local state for a newly created workspace without adding implicit tabs. */
export function buildCreatedWorkspaceState(
  state: WorkspaceStoreSlice,
  input: {
    projectId: string;
    normalizedName: string;
    normalizedTitle: string;
    normalizedBranch: string;
    backendWorkspace: {
      workspaceId: string;
      name: string;
      sourceBranch: string;
      branch: string;
      worktreePath: string;
    };
  },
): Partial<WorkspaceStoreSlice> {
  const nextWorkspaceId = input.backendWorkspace.workspaceId;

  return {
    workspaces: [
      ...state.workspaces,
      {
        id: nextWorkspaceId,
        projectId: input.projectId,
        repoId: input.projectId,
        name: input.backendWorkspace.name || input.normalizedName,
        title: input.normalizedTitle,
        sourceBranch: input.backendWorkspace.sourceBranch || input.normalizedBranch,
        branch: input.backendWorkspace.branch || input.normalizedBranch,
        summaryId: nextWorkspaceId,
        worktreePath: input.backendWorkspace.worktreePath,
      },
    ],
    selectedProjectId: input.projectId,
    selectedWorkspaceId: nextWorkspaceId,
  };
}

/** Removes one workspace and recalculates selection and tab state. */
export function buildDeletedWorkspaceState(
  state: WorkspaceStoreSlice,
  input: { projectId: string; workspaceId: string },
): Partial<WorkspaceStoreSlice> {
  const nextWorkspaces = state.workspaces.filter((workspace) => workspace.id !== input.workspaceId);
  const nextGitChangesCountByWorkspaceId = {
    ...state.gitChangesCountByWorkspaceId,
  };
  const nextGitChangeTotalsByWorkspaceId = {
    ...state.gitChangeTotalsByWorkspaceId,
  };
  delete nextGitChangesCountByWorkspaceId[input.workspaceId];
  delete nextGitChangeTotalsByWorkspaceId[input.workspaceId];

  const nextSelectedProjectId = state.projects.some((project) => project.id === state.selectedProjectId)
    ? state.selectedProjectId
    : (state.projects[0]?.id ?? "");

  const nextSelectedWorkspaceId =
    state.selectedWorkspaceId === input.workspaceId
      ? (nextWorkspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === input.projectId)?.id ??
        nextWorkspaces[0]?.id ??
        "")
      : state.selectedWorkspaceId;

  return {
    workspaces: nextWorkspaces,
    selectedProjectId: nextSelectedProjectId,
    selectedWorkspaceId: nextSelectedWorkspaceId,
    gitChangesCountByWorkspaceId: nextGitChangesCountByWorkspaceId,
    gitChangeTotalsByWorkspaceId: nextGitChangeTotalsByWorkspaceId,
  };
}

/** Applies a workspace rename when repo and workspace ids both match. */
export function buildRenamedWorkspaceState(
  state: Pick<WorkspaceStoreState, "workspaces">,
  input: { projectId: string; workspaceId: string; normalizedName: string },
): Pick<WorkspaceStoreState, "workspaces"> {
  return {
    workspaces: state.workspaces.map((workspace) => {
      if (workspace.id !== input.workspaceId || resolveWorkspaceProjectId(workspace) !== input.projectId) {
        return workspace;
      }

      return {
        ...workspace,
        name: input.normalizedName,
        title: input.normalizedName,
      };
    }),
  };
}

/** Applies a workspace branch rename when repo and workspace ids both match. */
export function buildRenamedWorkspaceBranchState(
  state: Pick<WorkspaceStoreState, "workspaces">,
  input: { projectId: string; workspaceId: string; normalizedBranch: string },
): Pick<WorkspaceStoreState, "workspaces"> {
  return {
    workspaces: state.workspaces.map((workspace) => {
      if (workspace.id !== input.workspaceId || resolveWorkspaceProjectId(workspace) !== input.projectId) {
        return workspace;
      }

      return {
        ...workspace,
        branch: input.normalizedBranch,
      };
    }),
  };
}

/** Counts changed files from staged, unstaged, and untracked groups. */
export function countWorkspaceGitChanges(sections: {
  staged: unknown[];
  unstaged: unknown[];
  untracked: unknown[];
}): number {
  return sections.staged.length + sections.unstaged.length + sections.untracked.length;
}

/** Sums additions and deletions across staged, unstaged, and untracked file sections. */
export function summarizeWorkspaceGitChangeTotals(sections: {
  staged: Array<{ additions: number; deletions: number }>;
  unstaged: Array<{ additions: number; deletions: number }>;
  untracked: Array<{ additions: number; deletions: number }>;
}): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const section of [sections.staged, sections.unstaged, sections.untracked]) {
    for (const file of section) {
      additions += Math.max(0, file.additions);
      deletions += Math.max(0, file.deletions);
    }
  }

  return {
    additions,
    deletions,
  };
}
