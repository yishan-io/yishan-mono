/**
 * Pure workspace snapshot reconciler.
 *
 * Phase 3: single owner of snapshot reconciliation. Takes backend records +
 * previous store state, returns a pure result (no store mutation). The
 * coordinator (`applySnapshot.ts`) applies the result to the feature stores
 * synchronously in one call stack.
 *
 * Transport DTOs (ProjectRecord, WorkspaceRecord) enter this module only; the
 * stores receive view models.
 */
import type { ExternalAppId } from "../../../../shared/contracts/externalApps";
import type { ProjectRecord, WorkspaceRecord } from "../../../api/types";
import type { WorkspacePullRequestSummary } from "../../../api/types";
import { resolveHydratedWorkspaceDisplayMetadata } from "../../../helpers/workspaceDisplayNames";
import type { DaemonWorkspacePullRequest } from "../../../rpc/daemonTypes";
import { getFileName } from "../../../store/tabs";
import type { WorkspaceItem, WorkspaceStoreOrganizationPreference, WorkspaceStoreState } from "../../../store/types";
import { buildWorkspaceStateFromData } from "../../../store/workspace/state";
import type { WorkspaceProjectRecord } from "../../project/model/projectTypes";
import type { WorkspaceGitChangeTotals } from "./workspaceTypes";
import type { WorkspaceStatus } from "./workspaceViewModel";

type ProjectStoreSlice = {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceStoreState["workspaces"];
  pullRequestByWorkspaceId: Record<string, DaemonWorkspacePullRequest | undefined>;
  latestPullRequestByWorkspaceId: Record<string, WorkspacePullRequestSummary | undefined>;
  gitChangesCountByWorkspaceId: Record<string, number>;
  gitChangeTotalsByWorkspaceId: Record<string, WorkspaceGitChangeTotals>;
  selectedProjectId: WorkspaceStoreState["selectedProjectId"];
  selectedWorkspaceId: WorkspaceStoreState["selectedWorkspaceId"];
  displayProjectIds?: string[];
  lastUsedExternalAppId?: ExternalAppId;
  organizationPreferencesById?: Record<string, WorkspaceStoreOrganizationPreference>;
};

export type SnapshotReconcilerInput = {
  projects: ProjectRecord[];
  workspacesFromApi: WorkspaceRecord[];
  organizationId: string;
  previousState: ProjectStoreSlice;
};

export type SnapshotReconcilerResult = {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
  selectedProjectId: string;
  selectedWorkspaceId: string;
  displayProjectIds: string[];
  lastUsedExternalAppId?: ExternalAppId;
  organizationPreferencesById?: Record<string, WorkspaceStoreOrganizationPreference>;
  /** Projection records to prune after reconciliation (workspace-scoped). */
  projectionCleanup: {
    gitChangesCountByWorkspaceId: Record<string, number>;
    gitChangeTotalsByWorkspaceId: Record<string, WorkspaceGitChangeTotals>;
    pullRequestByWorkspaceId: Record<string, DaemonWorkspacePullRequest | undefined>;
    latestPullRequestByWorkspaceId: Record<string, WorkspacePullRequestSummary | undefined>;
  };
};

function resolveWorkspaceProjectId(workspace: Pick<WorkspaceItem, "projectId" | "repoId">): string {
  return workspace.projectId ?? workspace.repoId;
}

/** Returns only entries keyed by workspace ids that still exist after snapshot reconciliation. */
function filterWorkspaceScopedRecord<T>(record: Record<string, T>, workspaceIdSet: Set<string>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [workspaceId, value] of Object.entries(record)) {
    if (workspaceIdSet.has(workspaceId)) {
      next[workspaceId] = value;
    }
  }
  return next;
}

function resolveNextDisplayProjectIds(input: {
  mappedProjects: WorkspaceProjectRecord[];
  orgPreferences: WorkspaceStoreOrganizationPreference | undefined;
  previousProjects: WorkspaceProjectRecord[];
}): string[] {
  const nextProjectIdSet = new Set(input.mappedProjects.map((project) => project.id));
  const previousProjectIdSet = new Set(input.previousProjects.map((project) => project.id));
  const persistedKnownProjectIds = input.orgPreferences?.knownProjectIds;
  const knownProjectIdSet =
    previousProjectIdSet.size > 0
      ? previousProjectIdSet
      : persistedKnownProjectIds !== undefined
        ? new Set(persistedKnownProjectIds)
        : undefined;
  const baseDisplayProjectIds = input.orgPreferences?.displayProjectIds ?? [];
  const filteredDisplayProjectIds = baseDisplayProjectIds.filter((projectId) => nextProjectIdSet.has(projectId));
  const discoveredProjectIds =
    knownProjectIdSet !== undefined
      ? input.mappedProjects
          .map((project) => project.id)
          .filter((projectId) => !baseDisplayProjectIds.includes(projectId) && !knownProjectIdSet.has(projectId))
      : [];
  const hasNoPersistedPreference =
    input.orgPreferences?.displayProjectIds === undefined || input.orgPreferences.displayProjectIds.length === 0;
  const shouldResetPersistedDisplayProjectIds =
    input.orgPreferences?.displayProjectIds !== undefined &&
    input.orgPreferences.displayProjectIds.length > 0 &&
    filteredDisplayProjectIds.length === 0 &&
    input.mappedProjects.length > 0;

  return hasNoPersistedPreference && input.mappedProjects.length > 0
    ? input.mappedProjects.map((project) => project.id)
    : shouldResetPersistedDisplayProjectIds
      ? input.mappedProjects.map((project) => project.id)
      : [...filteredDisplayProjectIds, ...discoveredProjectIds];
}

function resolveHydratedSelection(input: {
  workspaces: WorkspaceItem[];
  previousSelectedProjectId: string;
  previousSelectedWorkspaceId: string;
  mappedProjects: WorkspaceProjectRecord[];
  displayProjectIds: string[];
}): { selectedProjectId: string; selectedWorkspaceId: string } {
  const displayedProjectIdSet = new Set(input.displayProjectIds);
  const fallbackSelectedWorkspace = input.workspaces.find((workspace) =>
    displayedProjectIdSet.has(resolveWorkspaceProjectId(workspace)),
  );
  const fallbackSelectedProjectId =
    (fallbackSelectedWorkspace ? resolveWorkspaceProjectId(fallbackSelectedWorkspace) : undefined) ??
    input.mappedProjects.find((project) => displayedProjectIdSet.has(project.id))?.id ??
    "";
  const preservedSelectedWorkspace = input.workspaces.find(
    (workspace) =>
      workspace.id === input.previousSelectedWorkspaceId &&
      displayedProjectIdSet.has(resolveWorkspaceProjectId(workspace)),
  );
  const selectedProjectId = preservedSelectedWorkspace
    ? resolveWorkspaceProjectId(preservedSelectedWorkspace)
    : displayedProjectIdSet.has(input.previousSelectedProjectId)
      ? input.previousSelectedProjectId
      : fallbackSelectedProjectId;
  const selectedWorkspaceId =
    preservedSelectedWorkspace?.id ??
    input.workspaces.find((workspace) => resolveWorkspaceProjectId(workspace) === selectedProjectId)?.id ??
    "";

  return {
    selectedProjectId,
    selectedWorkspaceId,
  };
}

function preservePendingWorkspaceDisplayMetadata(
  workspaces: WorkspaceItem[],
  previousWorkspaces: WorkspaceItem[],
): WorkspaceItem[] {
  const previousWorkspaceById = new Map(previousWorkspaces.map((workspace) => [workspace.id, workspace]));

  return workspaces.map((workspace) => {
    const previousWorkspace = previousWorkspaceById.get(workspace.id);
    if (!previousWorkspace) {
      return workspace;
    }

    const previousPath = previousWorkspace.worktreePath?.trim() ?? "";
    const hydratedPath = workspace.worktreePath?.trim() ?? "";
    const hasPreviousPlaceholderPath = !previousPath;
    const hasHydratedPath = Boolean(hydratedPath);
    const isProvisioning = workspace.status === "provisioning" || previousWorkspace.status === "provisioning";
    // A workspace that already completed locally (active + real worktree path)
    // must never be downgraded back to provisioning by a weaker same-id
    // snapshot. The daemon overlays the host-local runtime path onto the remote
    // record, so a stale remote status (PATCH failed / never ran) arrives as
    // `provisioning` WITH a real localPath — the path check alone is not enough.
    const previousWorkspaceCompleted = previousWorkspace.status === "active" && Boolean(previousPath);
    const snapshotPathMatchesCompleted = hasHydratedPath && hydratedPath === previousPath;
    if (
      previousWorkspaceCompleted &&
      workspace.status === "provisioning" &&
      (!hasHydratedPath || snapshotPathMatchesCompleted)
    ) {
      return {
        ...workspace,
        name: previousWorkspace.name,
        title: previousWorkspace.title,
        status: previousWorkspace.status,
        worktreePath: previousWorkspace.worktreePath,
      };
    }

    if (!hasPreviousPlaceholderPath || hasHydratedPath || !isProvisioning) {
      return workspace;
    }

    return {
      ...workspace,
      name: previousWorkspace.name,
      title: previousWorkspace.title,
    };
  });
}

function resolvePreservedHydrationWorkspaces(
  previousWorkspaces: WorkspaceItem[],
  reconciledWorkspaces: WorkspaceItem[],
): WorkspaceItem[] {
  const reconciledIds = new Set(reconciledWorkspaces.map((workspace) => workspace.id));
  return previousWorkspaces.filter((workspace) => {
    if (reconciledIds.has(workspace.id)) {
      return false;
    }
    // Keep workspaces still being created locally (pending with no worktreePath)
    // and just-created local workspaces marked for transient missing-snapshot
    // protection. Without this, a snapshot refresh during async creation can
    // replace the store and destroy the visible workspace row.
    return workspace.status === "provisioning" || workspace.preserveOnMissingSnapshot === true;
  });
}

function buildLatestPullRequestByWorkspaceId(
  workspacesFromApi: WorkspaceRecord[],
): Record<string, WorkspacePullRequestSummary | undefined> {
  const nextLatestPrByWorkspaceId: Record<string, WorkspacePullRequestSummary | undefined> = {};
  for (const workspace of workspacesFromApi) {
    if (workspace.latestPullRequest) {
      nextLatestPrByWorkspaceId[workspace.id] = workspace.latestPullRequest;
    }
  }
  return nextLatestPrByWorkspaceId;
}

/** Maps backend API data into workspace projects and open workspaces. */
function mapApiData(
  projects: ProjectRecord[],
  workspacesFromApi: WorkspaceRecord[],
): {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
} {
  const preferredWorkspaceByProjectId = new Map<string, WorkspaceRecord>();
  for (const workspace of workspacesFromApi) {
    const projectId = workspace.projectId?.trim();
    if (!projectId) {
      continue;
    }

    const existing = preferredWorkspaceByProjectId.get(projectId);
    if (!existing || (workspace.kind === "primary" && existing.kind !== "primary")) {
      preferredWorkspaceByProjectId.set(projectId, workspace);
    }
  }

  const mappedProjects = projects.map((repo) => {
    const preferredWorkspace = preferredWorkspaceByProjectId.get(repo.id);
    const path = preferredWorkspace?.localPath?.trim() ?? "";
    const displayName = repo.name?.trim() || (path ? getFileName(path) : repo.id);
    return {
      ...repo,
      key: repo.repoKey ?? repo.id,
      name: displayName,
      path,
      missing: !path,
      gitUrl: repo.repoUrl ?? "",
      localPath: path,
      worktreePath: path,
      contextEnabled: repo.contextEnabled,
      defaultBranch: preferredWorkspace?.branch ?? "",
      icon: repo.icon,
      color: repo.color,
      setupScript: repo.setupScript,
      postScript: repo.postScript,
      commands: repo.commands,
    } satisfies WorkspaceProjectRecord;
  });

  const projectIdSet = new Set(mappedProjects.map((project) => project.id));
  const managedWorkspaces = workspacesFromApi
    .filter((workspace) => {
      const parentId = workspace.projectId ?? "";
      return projectIdSet.has(parentId);
    })
    // Closed rows are tombstones, not live workspaces: the remote list already
    // excludes them, and the only way one reaches the renderer is the daemon's
    // local-status overlay (a workspace closed on this host whose remote record
    // is still stale-active because the close PATCH failed or lagged). Re-adding
    // it resurrects a workspace the user just deleted.
    .filter((workspace) => workspace.status !== "closed")
    .map((workspace) => {
      const displayMetadata = resolveHydratedWorkspaceDisplayMetadata(workspace);
      return {
        id: workspace.id,
        organizationId: workspace.organizationId,
        projectId: workspace.projectId,
        repoId: workspace.projectId,
        name: displayMetadata.name,
        title: displayMetadata.title,
        sourceBranch: workspace.sourceBranch ?? "",
        branch: workspace.branch ?? "",
        summaryId: workspace.id,
        worktreePath: workspace.localPath,
        nodeId: workspace.nodeId,
        kind: "managed",
        status: workspace.status as WorkspaceStatus,
        state: workspace.state,
        health: workspace.health,
      } satisfies WorkspaceItem;
    });

  return {
    projects: mappedProjects,
    workspaces: managedWorkspaces,
  };
}

/** Reconciles current state with backend snapshot while preserving compatible UI-only state. */
export function reconcileWorkspaceSnapshot(input: SnapshotReconcilerInput): SnapshotReconcilerResult {
  const { projects, workspacesFromApi, organizationId, previousState } = input;
  const normalizedOrganizationId = organizationId.trim();
  const orgPreferences =
    normalizedOrganizationId.length > 0
      ? previousState.organizationPreferencesById?.[normalizedOrganizationId]
      : undefined;
  const previousSelectedProjectId = previousState.selectedProjectId;
  const previousSelectedWorkspaceId = previousState.selectedWorkspaceId;
  const { projects: mappedProjects, workspaces } = mapApiData(projects, workspacesFromApi);
  const reconciledWorkspaces = preservePendingWorkspaceDisplayMetadata(workspaces, previousState.workspaces);
  const nextBaseState = buildWorkspaceStateFromData({
    projects: mappedProjects,
    workspaces: reconciledWorkspaces,
  });
  const nextDisplayProjectIds = resolveNextDisplayProjectIds({
    mappedProjects,
    orgPreferences,
    previousProjects: previousState.projects,
  });
  const preservedWorkspaces = resolvePreservedHydrationWorkspaces(previousState.workspaces, reconciledWorkspaces);
  const nextWorkspaces = [...nextBaseState.workspaces, ...preservedWorkspaces];
  const nextSelection = resolveHydratedSelection({
    workspaces: nextWorkspaces,
    previousSelectedProjectId,
    previousSelectedWorkspaceId,
    mappedProjects,
    displayProjectIds: nextDisplayProjectIds,
  });

  const nextWorkspaceIdSet = new Set(nextWorkspaces.map((workspace) => workspace.id));

  return {
    projects: nextBaseState.projects,
    workspaces: nextWorkspaces,
    selectedProjectId: nextSelection.selectedProjectId,
    selectedWorkspaceId: nextSelection.selectedWorkspaceId,
    displayProjectIds: nextDisplayProjectIds,
    lastUsedExternalAppId: orgPreferences?.lastUsedExternalAppId,
    organizationPreferencesById:
      normalizedOrganizationId.length > 0
        ? {
            ...previousState.organizationPreferencesById,
            [normalizedOrganizationId]: {
              displayProjectIds: nextDisplayProjectIds,
              knownProjectIds: mappedProjects.map((project) => project.id),
              lastUsedExternalAppId: orgPreferences?.lastUsedExternalAppId,
            },
          }
        : previousState.organizationPreferencesById,
    projectionCleanup: {
      gitChangesCountByWorkspaceId: filterWorkspaceScopedRecord(
        { ...(previousState.gitChangesCountByWorkspaceId ?? {}) },
        nextWorkspaceIdSet,
      ),
      gitChangeTotalsByWorkspaceId: filterWorkspaceScopedRecord(
        { ...(previousState.gitChangeTotalsByWorkspaceId ?? {}) },
        nextWorkspaceIdSet,
      ),
      pullRequestByWorkspaceId: filterWorkspaceScopedRecord(
        { ...(previousState.pullRequestByWorkspaceId ?? {}) },
        nextWorkspaceIdSet,
      ),
      latestPullRequestByWorkspaceId: buildLatestPullRequestByWorkspaceId(workspacesFromApi),
    },
  };
}

export type { ProjectStoreSlice };
