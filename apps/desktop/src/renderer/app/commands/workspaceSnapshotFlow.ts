import { listOrganizations } from "@renderer/domains/organization";
import type { ProjectRecord } from "@renderer/domains/project";
import { hydrateProjectFilter, listProjectsByOrg, projectStore } from "@renderer/domains/project";

import { sessionStore } from "@renderer/domains/session";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import {
  openFoldersForSnapshot,
  restoreFolderSelectionIfNeeded,
  syncTabStoreWithWorkspace,
  warmupWorkspacesForProjects,
  workspaceCreateProgressStore,
  workspaceStore,
} from "@renderer/domains/workspace";
import { listLocalFolders } from "@renderer/domains/workspace";
import { reconcileWorkspaceSnapshot } from "./snapshotReconciler";
/**
 * WorkspaceSnapshotFlow — the shared workspace-snapshot load.
 *
 * Owns the full load orchestration: resolve the selected organization, fetch
 * projects + workspaces from the daemon, reconcile them against the pure
 * snapshot reconciler, apply to the feature stores, re-merge local folders,
 * reconcile in-flight create progress, sync tab state, and warm up pinned
 * projects on the daemon.
 *
 * Two entry types share this Flow (Flow Rule): the Project command surface
 * (`projectCommands.loadWorkspaceSnapshot`, the UI entry) and the Workspace
 * backend event handler (`workspaceEventHandlers`, invoked on snapshot
 * invalidation and daemon reconnect recovery).
 *
 * The Flow calls a few command wrappers (`syncTabStoreWithWorkspace`,
 * `workspaceWarmupCommand`, `localFolderCommands`) for shared coordination;
 * the heavy coordination itself is pure (`snapshotReconciler`/`applySnapshot`).
 */

let latestWorkspaceSnapshotRequestId = 0;

function hasSnapshotOmittedProjectAddedDuringRequest(
  projectIdsAtRequestStart: Set<string>,
  snapshotProjects: ProjectRecord[],
): boolean {
  const snapshotProjectIds = new Set(snapshotProjects.map((project) => project.id));
  return projectStore
    .getState()
    .projects.some((project) => !projectIdsAtRequestStart.has(project.id) && !snapshotProjectIds.has(project.id));
}

/** Loads the latest snapshot; callers may opt into diagnostics and rethrowing errors (background loads swallow them). */
export async function loadWorkspaceSnapshot(options?: {
  diagnostics?: boolean;
  throwOnError?: boolean;
}): Promise<void> {
  const requestId = ++latestWorkspaceSnapshotRequestId;
  let outcome: "applied" | "error" | "skipped" = "skipped";
  let stage = "organizations";
  let reason = "filter-not-hydrated";
  // Null distinguishes a stage not reached from an authoritative empty snapshot.
  let fetchedProjectCount: number | null = null;
  let fetchedWorkspaceCount: number | null = null;
  let reconciledProjectCount: number | null = null;
  let reconciledWorkspaceCount: number | null = null;
  const sessionState = sessionStore.getState();
  let isCurrentScope = true;
  const unsubscribe = sessionStore.subscribe((current) => {
    if (
      current.currentUserId !== sessionState.currentUserId ||
      current.daemonId !== sessionState.daemonId ||
      current.selectedOrganizationId !== sessionState.selectedOrganizationId
    )
      isCurrentScope = false;
  });
  const isCurrentRequest = () => {
    if (!isCurrentScope) {
      reason = "scope-changed";
      return false;
    }
    if (requestId !== latestWorkspaceSnapshotRequestId) {
      reason = "request-superseded";
      return false;
    }
    return true;
  };
  const projectIdsAtRequestStart = new Set(projectStore.getState().projects.map((project) => project.id));
  const previousWorkspaces = workspaceStore.getState().workspaces;
  const previousSelectedWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;

  try {
    const organizations =
      sessionState.organizations.length > 0 ? sessionState.organizations : await listOrganizations();
    if (!isCurrentRequest()) return;
    const selectedOrganization =
      sessionState.selectedOrganizationId &&
      organizations.some((organization) => organization.id === sessionState.selectedOrganizationId)
        ? organizations.find((organization) => organization.id === sessionState.selectedOrganizationId)
        : organizations[0];

    if (!selectedOrganization) {
      if (!isCurrentRequest()) {
        return;
      }

      stage = "apply-empty-workspaces";
      workspaceStore.getState().load("", []);

      stage = "local-folders";
      const orphanFolders = await listLocalFolders();
      if (!isCurrentRequest()) {
        return;
      }
      workspaceStore.getState().loadLocalFolders(orphanFolders);
      restoreFolderSelectionIfNeeded(previousWorkspaces, previousSelectedWorkspaceId);
      // Best-effort: re-open persisted folders on the daemon on demand so file
      // list/read/write and terminal.start work after a daemon restart.
      void openFoldersForSnapshot(orphanFolders, "");

      stage = "sync-tabs";
      await syncTabStoreWithWorkspace(previousWorkspaces);
      outcome = "applied";
      stage = "complete";
      reason = "local-folders-only";
      return;
    }

    stage = "project-filter";
    if (!(await hydrateProjectFilter(selectedOrganization.id, isCurrentRequest)) || !isCurrentRequest()) return;
    stage = "projects";
    const projectsWithWorkspaces = await listProjectsByOrg(selectedOrganization.id, {
      withWorkspaces: true,
    });
    const projects: ProjectRecord[] = projectsWithWorkspaces.map(({ workspaces: _, ...project }) => project);
    const workspaces = projectsWithWorkspaces.flatMap((project) => project.workspaces ?? []);
    fetchedProjectCount = projects.length;
    fetchedWorkspaceCount = workspaces.length;

    if (!isCurrentRequest()) {
      return;
    }

    // A successful local create can update the stores while this request is
    // pending. Do not let the pre-create response erase that visible project.
    if (hasSnapshotOmittedProjectAddedDuringRequest(projectIdsAtRequestStart, projects)) {
      reason = "snapshot-omitted-new-project";
      return;
    }

    // Phase 3: project records + preferences live in the project store. The
    // reconciler is the single owner of snapshot reconciliation; the flow
    // applies the reconciled result to each owner (projects -> project store,
    // workspaces -> workspace store view models).
    stage = "reconcile";
    const reconciled = reconcileWorkspaceSnapshot({
      projects,
      workspacesFromApi: workspaces,
      organizationId: selectedOrganization.id,
      previousState: {
        projects: projectStore.getState().projects,
        workspaces: workspaceStore.getState().workspaces,
        selectedProjectId: workbenchNavigationStore.getState().activeProjectId,
        selectedWorkspaceId: workbenchNavigationStore.getState().activeWorkspaceId,
        displayProjectIds: projectStore.getState().displayProjectIds,
        lastUsedExternalAppId: projectStore.getState().lastUsedExternalAppId,
        organizationPreferencesById: projectStore.getState().organizationPreferencesById,
      },
    });
    reconciledProjectCount = reconciled.projects.length;
    reconciledWorkspaceCount = reconciled.workspaces.length;
    stage = "apply-stores";
    projectStore
      .getState()
      .loadProjects(
        selectedOrganization.id,
        reconciled.projects,
        reconciled.displayProjectIds,
        reconciled.organizationPreferencesById,
        reconciled.lastUsedExternalAppId,
      );
    workspaceStore.getState().load(selectedOrganization.id, reconciled.workspaces);

    // Active Workspace/Project context lives in the Workbench navigation
    // Store (desktop6-adjust.md W2); the reconciler resolves it, the flow
    // applies it to the nav Store after the entity stores hydrate.
    workbenchNavigationStore.getState().setActiveProjectId(reconciled.selectedProjectId);
    workbenchNavigationStore.getState().setActiveWorkspaceId(reconciled.selectedWorkspaceId);

    // load() retains prior folder items until the authoritative folder snapshot replaces them.
    stage = "local-folders";
    const daemonFolders = await listLocalFolders();

    if (!isCurrentRequest()) {
      return;
    }
    workspaceStore.getState().loadLocalFolders(daemonFolders);
    restoreFolderSelectionIfNeeded(previousWorkspaces, previousSelectedWorkspaceId);
    // Best-effort: re-open persisted folders on the daemon on demand so file
    // list/read/write and terminal.start work after a daemon restart.
    void openFoldersForSnapshot(daemonFolders, selectedOrganization.id);

    stage = "create-progress";
    workspaceCreateProgressStore
      .getState()
      .reconcileHydratedWorkspaceCreateProgress(workspaceStore.getState().workspaces);
    stage = "sync-tabs";
    await syncTabStoreWithWorkspace(previousWorkspaces);

    // Warm up workspaces for currently pinned projects so the daemon has them
    // open and indexed for restart recovery. Already-open workspaces are skipped.
    stage = "warmup";
    const pinnedProjectIds = projectStore.getState().displayProjectIds;
    if (pinnedProjectIds.length > 0) {
      void warmupWorkspacesForProjects(pinnedProjectIds);
    }
    outcome = "applied";
    stage = "complete";
    reason = "snapshot-applied";
  } catch (error) {
    outcome = "error";
    reason = "exception";
    console.error("Failed to load workspace snapshot", error);
    if (options?.throwOnError) throw error;
  } finally {
    unsubscribe();
    if (options?.diagnostics) {
      const { projects, displayProjectIds } = projectStore.getState();
      console.info("Workspace snapshot diagnostics", {
        requestId,
        outcome,
        stage,
        reason,
        fetchedProjectCount,
        fetchedWorkspaceCount,
        reconciledProjectCount,
        reconciledWorkspaceCount,
        storeProjectCount: projects.length,
        storeWorkspaceCount: workspaceStore.getState().workspaces.length,
        displayedProjectCount: projects.filter((project) => displayProjectIds.includes(project.id)).length,
      });
    }
  }
}
