import { gitProjectionStore } from "@renderer/domains/git";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import type { WorkspaceProjectRecord } from "../domains/project/model/projectTypes";
/**
 * Composed screen read models.
 *
 * Phase 3: cross-store joins live here as pure selector functions (no side
 * effects). UI subscribes through these instead of joining stores inline.
 * Each selector reads current state via store.getState() and returns a derived
 * value; callers wrap in useMemo when subscribing.
 */
import { projectStore } from "../domains/project/state/projectStore";
import { layoutStore } from "../domains/workbench/state/layoutStore";
import type { WorkspaceItem } from "../domains/workspace/model/workspaceTypes";
import { workspaceStore } from "../domains/workspace/state/workspaceStore";

/** Resolves a workspace's owning project id (folder workspaces use their repo id). */
function resolveWorkspaceProjectId(workspace: Pick<WorkspaceItem, "projectId" | "repoId">): string {
  return workspace.projectId ?? workspace.repoId;
}

/** All projects + open workspaces (entity join). */
export function selectProjectTree(): {
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
} {
  return {
    projects: projectStore.getState().projects,
    workspaces: workspaceStore.getState().workspaces,
  };
}

/** The workspace list ordered by the left-pane hierarchy mode + display filter. */
export function selectWorkspaceList(): {
  workspaces: WorkspaceItem[];
  displayProjectIds: string[];
  workspaceListHierarchyMode: "by_project" | "by_node";
} {
  return {
    workspaces: workspaceStore.getState().workspaces,
    displayProjectIds: projectStore.getState().displayProjectIds,
    workspaceListHierarchyMode: projectStore.getState().workspaceListHierarchyMode,
  };
}

/** Selected workspace with its owning project (composed screen model). */
export function selectSelectedWorkspaceWithProject(): {
  selectedWorkspace: WorkspaceItem | undefined;
  selectedProject: WorkspaceProjectRecord | undefined;
  selectedProjectId: string;
  selectedWorkspaceId: string;
} {
  const workspaceState = workspaceStore.getState();
  const projectState = projectStore.getState();
  const selectedWorkspace = workspaceState.workspaces.find(
    (w) => w.id === workbenchNavigationStore.getState().activeWorkspaceId,
  );
  const selectedProject = selectedWorkspace
    ? projectState.projects.find((p) => p.id === resolveWorkspaceProjectId(selectedWorkspace))
    : undefined;
  return {
    selectedWorkspace,
    selectedProject,
    selectedProjectId: workbenchNavigationStore.getState().activeProjectId,
    selectedWorkspaceId: workbenchNavigationStore.getState().activeWorkspaceId,
  };
}

/** One workspace's projection slice (PR + branch + git totals + refresh version). */
export function selectWorkspaceProjection(workspaceId: string): {
  pullRequest: ReturnType<typeof gitProjectionStore.getState>["pullRequestByWorkspaceId"][string];
  currentBranch: string;
  gitChangeTotals: ReturnType<typeof gitProjectionStore.getState>["gitChangeTotalsByWorkspaceId"][string] | undefined;
  gitRefreshVersionByWorktreePath: Record<string, number>;
} {
  const state = gitProjectionStore.getState();
  return {
    pullRequest: state.pullRequestByWorkspaceId[workspaceId],
    currentBranch: state.currentBranchByWorkspaceId[workspaceId] ?? "",
    gitChangeTotals: state.gitChangeTotalsByWorkspaceId[workspaceId],
    gitRefreshVersionByWorktreePath: state.gitRefreshVersionByWorktreePath,
  };
}

/** Last-used external app id (project preference) for quick-open presets. */
export function selectLastUsedExternalAppId(): string | undefined {
  return projectStore.getState().lastUsedExternalAppId;
}

/** React subscription hook: selected workspace + owning project, re-renders on either store change. */
export function useSelectedWorkspaceWithProject(): ReturnType<typeof selectSelectedWorkspaceWithProject> {
  const selectedWorkspaceId = useWorkspaceSelectedId();
  const selectedProjectId = useProjectStoreSelectedProjectId();
  const selectedWorkspace = workspaceStore((s) => s.workspaces.find((w) => w.id === selectedWorkspaceId));
  const selectedProject = projectStore((s) =>
    selectedWorkspace ? s.projects.find((p) => p.id === resolveWorkspaceProjectId(selectedWorkspace)) : undefined,
  );
  return { selectedWorkspace, selectedProject, selectedProjectId, selectedWorkspaceId };
}

function useWorkspaceSelectedId(): string {
  return workbenchNavigationStore((s) => s.activeWorkspaceId);
}

function useProjectStoreSelectedProjectId(): string {
  return workbenchNavigationStore((s) => s.activeProjectId);
}
