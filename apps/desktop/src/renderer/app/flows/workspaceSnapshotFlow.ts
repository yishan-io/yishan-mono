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
import { api } from "../../api";
import type { ProjectRecord, ProjectWithWorkspacesRecord } from "../../api";
import { syncTabStoreWithWorkspace } from "../../features/workbench/commands/workspaceTabSync";
import { projectStore } from "../../features/project/state/projectStore";
import {
  openFoldersForSnapshot,
  restoreFolderSelectionIfNeeded,
} from "../../features/workspace/commands/localFolderCommands";
import { warmupWorkspacesForProjects } from "../../features/workspace/commands/workspaceWarmupCommand";
import { reconcileWorkspaceSnapshot } from "../../features/workspace/model/snapshotReconciler";
import { workspaceProjectionStore } from "../../features/workspace/state/workspaceProjectionStore";
import { getDaemonClient } from "../../rpc/rpcTransport";
import { sessionStore } from "../../features/session/state/sessionStore";
import { workspaceCreateProgressStore } from "../../features/workspace/state/workspaceCreateProgressStore";
import { workspaceStore } from "../../features/workspace/state/workspaceStore";

let latestWorkspaceSnapshotRequestId = 0;

function isLatestWorkspaceSnapshotRequest(requestId: number): boolean {
  return requestId === latestWorkspaceSnapshotRequestId;
}

/** Loads the latest workspace snapshot and syncs local desktop/daemon state to it. */
export async function loadWorkspaceSnapshot(): Promise<void> {
  const requestId = ++latestWorkspaceSnapshotRequestId;
  const previousWorkspaces = workspaceStore.getState().workspaces;
  const previousSelectedWorkspaceId = workspaceStore.getState().selectedWorkspaceId;

  try {
    const sessionState = sessionStore.getState();
    const organizations = sessionState.organizations.length > 0 ? sessionState.organizations : await api.org.list();
    const selectedOrganization =
      sessionState.selectedOrganizationId &&
      organizations.some((organization) => organization.id === sessionState.selectedOrganizationId)
        ? organizations.find((organization) => organization.id === sessionState.selectedOrganizationId)
        : organizations[0];

    if (!selectedOrganization) {
      if (!isLatestWorkspaceSnapshotRequest(requestId)) {
        return;
      }

      workspaceStore.getState().load("", [], []);

      const orphanDaemonClient = await getDaemonClient();
      const orphanFolders = await orphanDaemonClient.workspace.listLocalFolders();
      if (!isLatestWorkspaceSnapshotRequest(requestId)) {
        return;
      }
      workspaceStore.getState().loadLocalFolders(orphanFolders);
      restoreFolderSelectionIfNeeded(previousWorkspaces, previousSelectedWorkspaceId);
      // Best-effort: re-open persisted folders on the daemon on demand so file
      // list/read/write and terminal.start work after a daemon restart.
      void openFoldersForSnapshot(orphanFolders, "");

      syncTabStoreWithWorkspace(previousWorkspaces);
      return;
    }

    const daemonClient = await getDaemonClient();
    const projectsWithWorkspaces = (await daemonClient.project.listByOrg(selectedOrganization.id, {
      withWorkspaces: true,
    })) as ProjectWithWorkspacesRecord[];
    const projects: ProjectRecord[] = projectsWithWorkspaces.map(({ workspaces: _, ...project }) => project);
    const workspaces = projectsWithWorkspaces.flatMap((project) => project.workspaces ?? []);

    if (!isLatestWorkspaceSnapshotRequest(requestId)) {
      return;
    }

    workspaceStore.getState().load(selectedOrganization.id, projects, workspaces);

    // Phase 3: project records + preferences live in the project store. Mirror
    // the reconciled result so the UI reads one source of truth per owner.
    const reconciled = reconcileWorkspaceSnapshot({
      projects,
      workspacesFromApi: workspaces,
      organizationId: selectedOrganization.id,
      previousState: {
        projects: projectStore.getState().projects,
        workspaces: workspaceStore.getState().workspaces,
        pullRequestByWorkspaceId: workspaceProjectionStore.getState().pullRequestByWorkspaceId,
        latestPullRequestByWorkspaceId: workspaceProjectionStore.getState().latestPullRequestByWorkspaceId,
        gitChangesCountByWorkspaceId: workspaceProjectionStore.getState().gitChangesCountByWorkspaceId,
        gitChangeTotalsByWorkspaceId: workspaceProjectionStore.getState().gitChangeTotalsByWorkspaceId,
        selectedProjectId: workspaceStore.getState().selectedProjectId,
        selectedWorkspaceId: workspaceStore.getState().selectedWorkspaceId,
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

    // load() rebuilds workspaces[] and drops folder items; re-merge folders after it.
    const daemonFolders = await daemonClient.workspace.listLocalFolders();
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
    syncTabStoreWithWorkspace(previousWorkspaces);

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
