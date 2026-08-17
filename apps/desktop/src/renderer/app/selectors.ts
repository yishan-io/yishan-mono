/**
 * Composed screen read models.
 *
 * Phase 3: cross-store joins live here as pure selector functions (no side
 * effects). UI subscribes through these instead of joining stores inline.
 * Each selector reads current state via store.getState() and returns a derived
 * value; callers wrap in useMemo when subscribing.
 */
import { projectStore } from "../features/project/state/projectStore";
import type { WorkspaceProjectRecord } from "../features/project/model/projectTypes";
import { workspaceProjectionStore } from "../features/workspace/state/workspaceProjectionStore";
import type { WorkspaceItem } from "../features/workspace/model/workspaceTypes";
import { layoutStore } from "../features/workbench/state/layoutStore";
import { workspaceStore } from "../features/workspace/state/workspaceStore";
import { workspaceUiStore } from "../features/workspace/state/workspaceUiStore";

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
  const selectedWorkspace = workspaceState.workspaces.find((w) => w.id === workspaceState.selectedWorkspaceId);
  const selectedProject = selectedWorkspace
    ? projectState.projects.find((p) => p.id === resolveWorkspaceProjectId(selectedWorkspace))
    : undefined;
  return {
    selectedWorkspace,
    selectedProject,
    selectedProjectId: workspaceState.selectedProjectId,
    selectedWorkspaceId: workspaceState.selectedWorkspaceId,
  };
}

/** One workspace's projection slice (PR + branch + git totals + refresh version). */
export function selectWorkspaceProjection(workspaceId: string): {
  pullRequest: ReturnType<typeof workspaceProjectionStore.getState>["pullRequestByWorkspaceId"][string];
  currentBranch: string;
  gitChangeTotals:
    | ReturnType<typeof workspaceProjectionStore.getState>["gitChangeTotalsByWorkspaceId"][string]
    | undefined;
  gitRefreshVersionByWorktreePath: Record<string, number>;
} {
  const state = workspaceProjectionStore.getState();
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
  return workspaceStore((s) => s.selectedWorkspaceId);
}

function useProjectStoreSelectedProjectId(): string {
  return workspaceStore((s) => s.selectedProjectId);
}

/** Pure combine: workspace pane collapsed flags from the three store slices. */
export function selectWorkspacePaneVisibility(input: {
  leftHidden: boolean;
  selectedWorkspaceId: string;
  rightHiddenByWorkspaceId: Record<string, boolean>;
}): { leftCollapsed: boolean; rightCollapsed: boolean } {
  return {
    leftCollapsed: input.leftHidden,
    rightCollapsed: input.rightHiddenByWorkspaceId[input.selectedWorkspaceId] ?? true,
  };
}

/** React subscription hook: pane collapsed flags + selected workspace, re-renders on any of the three stores. */
export function useWorkspacePaneVisibilityState(): {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  selectedWorkspaceId: string;
} {
  const leftHidden = layoutStore((s) => s.isLeftPaneManuallyHidden);
  const selectedWorkspaceId = workspaceStore((s) => s.selectedWorkspaceId);
  const rightHiddenByWorkspaceId = workspaceUiStore((s) => s.isRightPaneHiddenByWorkspaceId);
  const collapsed = selectWorkspacePaneVisibility({ leftHidden, selectedWorkspaceId, rightHiddenByWorkspaceId });
  return { ...collapsed, selectedWorkspaceId };
}
