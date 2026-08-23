import { listOrganizations } from "@renderer/domains/organization";
import type { ProjectRecord } from "@renderer/domains/project";
import { listProjectsByOrg, projectStore } from "@renderer/domains/project";

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

function isLatestWorkspaceSnapshotRequest(requestId: number): boolean {
  return requestId === latestWorkspaceSnapshotRequestId;
}

function hasSnapshotOmittedProjectAddedDuringRequest(
  projectIdsAtRequestStart: Set<string>,
  snapshotProjects: ProjectRecord[],
): boolean {
  const snapshotProjectIds = new Set(snapshotProjects.map((project) => project.id));
  return projectStore
    .getState()
    .projects.some((project) => !projectIdsAtRequestStart.has(project.id) && !snapshotProjectIds.has(project.id));
}

/** Loads the latest workspace snapshot and syncs local desktop/daemon state to it. */
export async function loadWorkspaceSnapshot(): Promise<void> {
  const requestId = ++latestWorkspaceSnapshotRequestId;
  const projectIdsAtRequestStart = new Set(projectStore.getState().projects.map((project) => project.id));
  const previousWorkspaces = workspaceStore.getState().workspaces;
  const previousSelectedWorkspaceId = workbenchNavigationStore.getState().activeWorkspaceId;

  try {
    const sessionState = sessionStore.getState();
    const organizations =
      sessionState.organizations.length > 0 ? sessionState.organizations : await listOrganizations();
    const selectedOrganization =
      sessionState.selectedOrganizationId &&
      organizations.some((organization) => organization.id === sessionState.selectedOrganizationId)
        ? organizations.find((organization) => organization.id === sessionState.selectedOrganizationId)
        : organizations[0];

    if (!selectedOrganization) {
      if (!isLatestWorkspaceSnapshotRequest(requestId)) {
        return;
      }

      workspaceStore.getState().load("", []);

      const orphanFolders = await listLocalFolders();
      if (!isLatestWorkspaceSnapshotRequest(requestId)) {
        return;
      }
      workspaceStore.getState().loadLocalFolders(orphanFolders);
      restoreFolderSelectionIfNeeded(previousWorkspaces, previousSelectedWorkspaceId);
      // Best-effort: re-open persisted folders on the daemon on demand so file
      // list/read/write and terminal.start work after a daemon restart.
      void openFoldersForSnapshot(orphanFolders, "");

      await syncTabStoreWithWorkspace(previousWorkspaces);
      return;
    }

    const projectsWithWorkspaces = await listProjectsByOrg(selectedOrganization.id, {
      withWorkspaces: true,
    });
    const projects: ProjectRecord[] = projectsWithWorkspaces.map(({ workspaces: _, ...project }) => project);
    const workspaces = projectsWithWorkspaces.flatMap((project) => project.workspaces ?? []);

    if (!isLatestWorkspaceSnapshotRequest(requestId)) {
      return;
    }

    // A successful local create can update the stores while this request is
    // pending. Do not let the pre-create response erase that visible project.
    if (hasSnapshotOmittedProjectAddedDuringRequest(projectIdsAtRequestStart, projects)) {
      return;
    }

    // Phase 3: project records + preferences live in the project store. The
    // reconciler is the single owner of snapshot reconciliation; the flow
    // applies the reconciled result to each owner (projects -> project store,
    // workspaces -> workspace store view models).
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

    // load() rebuilds workspaces[] and drops folder items; re-merge folders after it.
    const daemonFolders = await listLocalFolders();

    if (!isLatestWorkspaceSnapshotRequest(requestId)) {
      return;
    }
    workspaceStore.getState().loadLocalFolders(daemonFolders);
    restoreFolderSelectionIfNeeded(previousWorkspaces, previousSelectedWorkspaceId);
    // Best-effort: re-open persisted folders on the daemon on demand so file
    // list/read/write and terminal.start work after a daemon restart.
    void openFoldersForSnapshot(daemonFolders, selectedOrganization.id);

    workspaceCreateProgressStore
      .getState()
      .reconcileHydratedWorkspaceCreateProgress(workspaceStore.getState().workspaces);
    await syncTabStoreWithWorkspace(previousWorkspaces);

    // Warm up workspaces for currently pinned projects so the daemon has them
    // open and indexed for restart recovery. Already-open workspaces are skipped.
    const pinnedProjectIds = projectStore.getState().displayProjectIds;
    if (pinnedProjectIds.length > 0) {
      void warmupWorkspacesForProjects(pinnedProjectIds);
    }
  } catch (error) {
    console.error("Failed to load workspace snapshot", error);
  }
}
