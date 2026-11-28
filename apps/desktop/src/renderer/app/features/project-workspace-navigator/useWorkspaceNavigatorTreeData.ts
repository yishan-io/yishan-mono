import { resolveWorkspaceNotificationTone } from "@renderer/app/selectors";

import { filterVisibleProjects, projectStore, supportsGitFeatures } from "@renderer/domains/project";

import { chatStore } from "@renderer/domains/agent";
import { gitProjectionStore } from "@renderer/domains/git";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import { workspaceStore } from "@renderer/domains/workspace";
import { resolveWorkspaceListDisplayName } from "@renderer/domains/workspace";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { useEffect, useMemo } from "react";
import type { WorkspaceTreeWorkspace } from "./workspace-tree";
import type { WorkspaceTreeProject } from "./workspace-tree/types";
import { createNavigatorOrderComparator } from "./workspaceNavigatorOrder";

type TreeProject = WorkspaceTreeProject;

export type ProjectListTreeDataResult = {
  filteredProjects: Array<{
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    localPath?: string | null;
    path?: string | null;
    worktreePath?: string | null;
  }>;
  treeProjects: TreeProject[];
  treeWorkspaces: WorkspaceTreeWorkspace[];
  expandedTreeItems: string[];
  displayWorkspaceIdByProjectId: Record<string, string>;
  workspaceByProjectId: Record<string, WorkspaceItem[]>;
};

/**
 * Derives the tree data structures (projects, workspaces, expanded items)
 * consumed by the WorkspaceTree component. All derivations are memoized.
 */
export function useWorkspaceNavigatorTreeData(input: {
  projectOrderIds: string[];
  workspaceOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
}): ProjectListTreeDataResult {
  const { projectOrderIds, workspaceOrderByParentId, foldedProjectIds } = input;

  const projects = projectStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const displayProjectIds = projectStore((state) => state.displayProjectIds) ?? [];
  const gitChangeTotalsByWorkspaceId = gitProjectionStore((state) => state.gitChangeTotalsByWorkspaceId);
  const workspaceAgentStatusByWorkspaceId = chatStore((state) => state.workspaceAgentStatusByWorkspaceId);
  const workspaceUnreadToneByWorkspaceId = chatStore((state) => state.workspaceUnreadToneByWorkspaceId);

  const workspaceByProjectId = workspaces.reduce<Record<string, (typeof workspaces)[number][]>>((acc, workspace) => {
    const existing = acc[workspace.repoId];
    if (existing) {
      existing.push(workspace);
    } else {
      acc[workspace.repoId] = [workspace];
    }
    return acc;
  }, {});

  const filteredProjects = useMemo(() => {
    return filterVisibleProjects(projects, displayProjectIds).sort(createNavigatorOrderComparator(projectOrderIds));
  }, [displayProjectIds, projectOrderIds, projects]);

  const treeProjects = filteredProjects.map((project) => ({
    id: project.id,
    name: project.name,
    icon: project.icon,
    color: project.color,
    supportsGitFeatures: supportsGitFeatures(project.sourceType),
  }));

  const treeWorkspaces: WorkspaceTreeWorkspace[] = useMemo(() => {
    const rows: WorkspaceTreeWorkspace[] = [];
    for (const project of filteredProjects) {
      const projectWorkspaces = workspaceByProjectId[project.id] ?? [];
      const preferredProjectPath =
        project.localPath?.trim() || project.path?.trim() || project.worktreePath?.trim() || "";
      const localDisplayWorkspaceId = preferredProjectPath
        ? (projectWorkspaces.find(
            (workspace) => workspace.kind !== "local" && workspace.worktreePath?.trim() === preferredProjectPath,
          )?.id ?? "")
        : "";
      const displayedWorkspaces = localDisplayWorkspaceId
        ? projectWorkspaces.filter((workspace) => workspace.kind !== "local")
        : projectWorkspaces;

      for (const workspace of displayedWorkspaces) {
        const isCreating = workspace.status === "provisioning";
        rows.push({
          id: workspace.id,
          name: resolveWorkspaceListDisplayName(workspace, localDisplayWorkspaceId),
          projectId: project.id,
          nodeId: workspace.nodeId?.trim() || "unknown",
          kind: workspace.kind === "local" || localDisplayWorkspaceId === workspace.id ? "local" : "managed",
          additions: gitChangeTotalsByWorkspaceId[workspace.id]?.additions ?? 0,
          deletions: gitChangeTotalsByWorkspaceId[workspace.id]?.deletions ?? 0,
          runtimeStatus: workspaceAgentStatusByWorkspaceId[workspace.id] ?? "idle",
          notificationTone: resolveWorkspaceNotificationTone({
            runtimeStatus: workspaceAgentStatusByWorkspaceId[workspace.id] ?? "idle",
            unreadTone: workspaceUnreadToneByWorkspaceId[workspace.id],
          }),
          isCreating,
          lifecycleState: workspace.state,
          health: workspace.health,
        });
      }
    }

    // Non-git local folder workspaces are synthetic rows keyed by the sentinel
    // project id. They never map to a real project, so they are rendered under
    // a dedicated group row (useVisibleWorkspaceTree) and mirrored as children
    // of that group.
    const folderWorkspaces = workspaces.filter(
      (workspace) => workspace.projectId === LOCAL_FOLDER_PROJECT_ID || workspace.kind === "folder",
    );

    for (const workspace of folderWorkspaces) {
      rows.push({
        id: workspace.id,
        name: resolveWorkspaceListDisplayName(workspace, ""),
        projectId: LOCAL_FOLDER_PROJECT_ID,
        nodeId: workspace.nodeId?.trim() || "unknown",
        isLocalFolder: true,
        lifecycleState: workspace.state,
        health: workspace.health,
      });
    }

    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const projectById = new Map(filteredProjects.map((project) => [project.id, project]));
    const comparatorByParent = new Map<string, ReturnType<typeof createNavigatorOrderComparator>>();
    const getComparator = (parentKey: string, order: string[]) => {
      let comparator = comparatorByParent.get(parentKey);
      if (!comparator) {
        comparator = createNavigatorOrderComparator(order);
        comparatorByParent.set(parentKey, comparator);
      }
      return comparator;
    };
    return rows.sort((a, b) => {
      if (a.projectId !== b.projectId) {
        return getComparator("root:project", projectOrderIds)(
          projectById.get(a.projectId) ?? { id: a.projectId },
          projectById.get(b.projectId) ?? { id: b.projectId },
        );
      }
      if (a.nodeId !== b.nodeId) {
        return a.nodeId < b.nodeId ? -1 : 1;
      }
      // Workspace order is persisted per `${projectId}:${nodeId}` bucket, where
      // nodeId is the current daemon's node.
      const parentKey = `${a.projectId}:${a.nodeId}`;
      return getComparator(parentKey, workspaceOrderByParentId[parentKey] ?? [])(
        workspaceById.get(a.id) ?? a,
        workspaceById.get(b.id) ?? b,
      );
    });
  }, [
    filteredProjects,
    gitChangeTotalsByWorkspaceId,
    projectOrderIds,
    workspaceOrderByParentId,
    workspaceAgentStatusByWorkspaceId,
    workspaceByProjectId,
    workspaceUnreadToneByWorkspaceId,
    workspaces,
  ]);

  useEffect(() => {
    workspaceStore.getState().setOrderedWorkspaceIds(treeWorkspaces.map((workspace) => workspace.id));
  }, [treeWorkspaces]);

  const expandedTreeItems = useMemo(() => {
    const items: string[] = [];
    const foldedSet = new Set(foldedProjectIds);

    // The synthetic "Local Folders" group is expanded by default and folds via
    // the sentinel project id in foldedProjectIds.
    if (!foldedSet.has(LOCAL_FOLDER_PROJECT_ID)) {
      items.push(`project:${LOCAL_FOLDER_PROJECT_ID}`);
    }

    for (const project of filteredProjects) {
      if (!foldedSet.has(project.id)) {
        items.push(`project:${project.id}`);
      }
    }
    return items;
  }, [filteredProjects, foldedProjectIds]);

  const displayWorkspaceIdByProjectId = useMemo(() => {
    const displayWorkspaceIdByProjectIdMap: Record<string, string> = {};

    for (const project of projects) {
      const projectWorkspaces = workspaceByProjectId[project.id] ?? [];
      const preferredProjectPath =
        project.localPath?.trim() || project.path?.trim() || project.worktreePath?.trim() || "";
      if (!preferredProjectPath) {
        continue;
      }

      const primaryWorkspace = projectWorkspaces.find(
        (workspace) => workspace.kind !== "local" && workspace.worktreePath?.trim() === preferredProjectPath,
      );
      if (primaryWorkspace) {
        displayWorkspaceIdByProjectIdMap[project.id] = primaryWorkspace.id;
      }
    }

    return displayWorkspaceIdByProjectIdMap;
  }, [projects, workspaceByProjectId]);

  return {
    filteredProjects,
    treeProjects,
    treeWorkspaces,
    expandedTreeItems,
    displayWorkspaceIdByProjectId,
    workspaceByProjectId,
  };
}
