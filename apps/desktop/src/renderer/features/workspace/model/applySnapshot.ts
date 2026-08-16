/**
 * Snapshot hydration coordinator.
 *
 * Phase 3: single apply path for snapshot reconciliation results. All store
 * writes run synchronously in one call stack — zustand sets within one task
 * batch into a single React render, so transient cross-store inconsistency is
 * not observable. Ordering: project records → workspace entities+selection →
 * projections.
 *
 * The coordinator is the only place that writes the reconciled result to the
 * feature stores (projectStore, workspaceStore, projection store).
 */
import {
  type SnapshotReconcilerInput,
  type SnapshotReconcilerResult,
  reconcileWorkspaceSnapshot,
} from "./snapshotReconciler";

type CoordinatorStores = {
  projectStore: {
    setProjects: (projects: SnapshotReconcilerResult["projects"], isProjectsLoaded: boolean) => void;
    setDisplayProjectIds: (projectIds: string[]) => void;
    setLastUsedExternalAppId: (appId?: string) => void;
    setOrganizationPreferencesById: (prefs: SnapshotReconcilerResult["organizationPreferencesById"]) => void;
  };
  workspaceStore: {
    setWorkspaces: (workspaces: SnapshotReconcilerResult["workspaces"]) => void;
    setSelection: (selectedProjectId: string, selectedWorkspaceId: string) => void;
  };
  projectionStore: {
    setPullRequests: (
      pullRequestByWorkspaceId: SnapshotReconcilerResult["projectionCleanup"]["pullRequestByWorkspaceId"],
    ) => void;
    setLatestPullRequests: (
      latest: SnapshotReconcilerResult["projectionCleanup"]["latestPullRequestByWorkspaceId"],
    ) => void;
    setGitChangesCounts: (
      counts: SnapshotReconcilerResult["projectionCleanup"]["gitChangesCountByWorkspaceId"],
    ) => void;
    setGitChangeTotals: (totals: SnapshotReconcilerResult["projectionCleanup"]["gitChangeTotalsByWorkspaceId"]) => void;
  };
};

/**
 * Reconciles backend snapshot data and applies the result to the feature
 * stores. Runs synchronously: one call stack, one React commit.
 */
export function applySnapshotToStores(
  input: Omit<SnapshotReconcilerInput, "previousState"> & { previousState: SnapshotReconcilerInput["previousState"] },
  stores: CoordinatorStores,
): void {
  const result = reconcileWorkspaceSnapshot(input);

  // 1. Project records + preferences.
  stores.projectStore.setProjects(result.projects, true);
  stores.projectStore.setDisplayProjectIds(result.displayProjectIds);
  stores.projectStore.setLastUsedExternalAppId(result.lastUsedExternalAppId);
  stores.projectStore.setOrganizationPreferencesById(result.organizationPreferencesById);

  // 2. Workspace entities + selection.
  stores.workspaceStore.setWorkspaces(result.workspaces);
  stores.workspaceStore.setSelection(result.selectedProjectId, result.selectedWorkspaceId);

  // 3. Projections (pruned to surviving workspace ids).
  stores.projectionStore.setPullRequests(result.projectionCleanup.pullRequestByWorkspaceId);
  stores.projectionStore.setLatestPullRequests(result.projectionCleanup.latestPullRequestByWorkspaceId);
  stores.projectionStore.setGitChangesCounts(result.projectionCleanup.gitChangesCountByWorkspaceId);
  stores.projectionStore.setGitChangeTotals(result.projectionCleanup.gitChangeTotalsByWorkspaceId);
}
