import { resolveWorkspaceNotificationTone } from "@renderer/app/selectors";

import { listOrgNodes } from "@renderer/domains/node";
import { filterVisibleProjects, projectStore, supportsGitFeatures } from "@renderer/domains/project";

import { chatStore } from "@renderer/domains/agent";
import { gitProjectionStore } from "@renderer/domains/git";
import { sessionStore } from "@renderer/domains/session";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import { workspaceStore } from "@renderer/domains/workspace";
import { resolveWorkspaceListDisplayName } from "@renderer/domains/workspace";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { WorkspaceTreeWorkspace } from "./workspace-tree";
import type { WorkspaceTreeNode, WorkspaceTreeProject } from "./workspace-tree/types";
import { createNavigatorOrderComparator } from "./workspaceNavigatorOrder";

type TreeProject = WorkspaceTreeProject;
type TreeNode = WorkspaceTreeNode;

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
  treeNodes: TreeNode[];
  treeWorkspaces: WorkspaceTreeWorkspace[];
  expandedTreeItems: string[];
  displayWorkspaceIdByProjectId: Record<string, string>;
  workspaceByProjectId: Record<string, WorkspaceItem[]>;
};

/**
 * Derives the tree data structures (projects, nodes, workspaces, expanded items)
 * consumed by the WorkspaceTree component. All derivations are memoized.
 */
export function useWorkspaceNavigatorTreeData(input: {
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
  workspaceOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
  foldedNodeKeys: string[];
  workspaceListHierarchyMode: "by_project" | "by_node";
}): ProjectListTreeDataResult {
  const {
    projectOrderIds,
    nodeOrderByParentId,
    workspaceOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    workspaceListHierarchyMode,
  } = input;

  const projects = projectStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const displayProjectIds = projectStore((state) => state.displayProjectIds) ?? [];
  const gitChangeTotalsByWorkspaceId = gitProjectionStore((state) => state.gitChangeTotalsByWorkspaceId);
  const workspaceAgentStatusByWorkspaceId = chatStore((state) => state.workspaceAgentStatusByWorkspaceId);
  const workspaceUnreadToneByWorkspaceId = chatStore((state) => state.workspaceUnreadToneByWorkspaceId);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);

  const nodesQuery = useQuery({
    queryKey: ["org-nodes", selectedOrganizationId],
    queryFn: () => listOrgNodes(selectedOrganizationId as string),
    enabled: Boolean(selectedOrganizationId),
  });

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

  const treeNodes = (nodesQuery.data ?? []).map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    scope: node.scope,
    isOnline: node.isOnline,
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
    // of that group. They are ordered before real projects only by node (folders
    // are node-scoped), matching how managed workspaces behave under the group.
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
    const nodeById = new Map((nodesQuery.data ?? []).map((node) => [node.id, node]));
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
      if (workspaceListHierarchyMode === "by_node") {
        if (a.nodeId !== b.nodeId) {
          return getComparator("root:node", nodeOrderByParentId["root:node"] ?? [])(
            nodeById.get(a.nodeId) ?? { id: a.nodeId },
            nodeById.get(b.nodeId) ?? { id: b.nodeId },
          );
        }
        if (a.projectId !== b.projectId) {
          const parentKey = `node:${a.nodeId}`;
          return getComparator(parentKey, nodeOrderByParentId[parentKey] ?? [])(
            projectById.get(a.projectId) ?? { id: a.projectId },
            projectById.get(b.projectId) ?? { id: b.projectId },
          );
        }
      } else {
        if (a.projectId !== b.projectId) {
          return getComparator("root:project", projectOrderIds)(
            projectById.get(a.projectId) ?? { id: a.projectId },
            projectById.get(b.projectId) ?? { id: b.projectId },
          );
        }
        if (a.nodeId !== b.nodeId) {
          const parentKey = `project:${a.projectId}`;
          return getComparator(parentKey, nodeOrderByParentId[parentKey] ?? [])(
            nodeById.get(a.nodeId) ?? { id: a.nodeId },
            nodeById.get(b.nodeId) ?? { id: b.nodeId },
          );
        }
      }
      // The same project/node bucket is used in both hierarchy modes, including local folders.
      const parentKey = `${a.projectId}:${a.nodeId}`;
      return getComparator(parentKey, workspaceOrderByParentId[parentKey] ?? [])(
        workspaceById.get(a.id) ?? a,
        workspaceById.get(b.id) ?? b,
      );
    });
  }, [
    filteredProjects,
    gitChangeTotalsByWorkspaceId,
    nodeOrderByParentId,
    nodesQuery.data,
    projectOrderIds,
    workspaceOrderByParentId,
    workspaceListHierarchyMode,
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
    const foldedTopSet = new Set(foldedProjectIds);
    const foldedChildSet = new Set(foldedNodeKeys);
    // Folder workspaces are synthetic rows; they never drive the fold state of
    // real projects/nodes. In by_project mode they render under the synthetic
    // "Local Folders" group; in by_node mode they render under a per-node
    // "Local Folders" group row (folded via that group's own key).
    const nonFolderWorkspaces = treeWorkspaces.filter((workspace) => !workspace.isLocalFolder);
    const folderNodeIds = Array.from(
      new Set(treeWorkspaces.filter((workspace) => workspace.isLocalFolder).map((workspace) => workspace.nodeId)),
    );

    if (workspaceListHierarchyMode === "by_node") {
      // Include folder workspaces' node ids so a node that hosts only folder
      // workspaces still renders (and can be folded) as a node row.
      const nodeIds = Array.from(
        new Set([...nonFolderWorkspaces.map((workspace) => workspace.nodeId), ...folderNodeIds]),
      );
      for (const nodeId of nodeIds) {
        if (foldedTopSet.has(nodeId)) {
          continue;
        }

        items.push(`node:${nodeId}`);
        const projectIds = Array.from(
          new Set(
            nonFolderWorkspaces
              .filter((workspace) => workspace.nodeId === nodeId)
              .map((workspace) => workspace.projectId),
          ),
        );
        for (const projectId of projectIds) {
          const projectKey = `${nodeId}:${projectId}`;
          if (!foldedChildSet.has(projectKey)) {
            items.push(`project:${projectKey}`);
          }
        }

        // The per-node "Local Folders" group row: expanded by default, folds
        // via its node-scoped key in foldedNodeKeys.
        const folderGroupKey = `${nodeId}:${LOCAL_FOLDER_PROJECT_ID}`;
        if (folderNodeIds.includes(nodeId) && !foldedChildSet.has(folderGroupKey)) {
          items.push(`project:${folderGroupKey}`);
        }
      }
      return items;
    }

    // The synthetic "Local Folders" group is expanded by default and folds via
    // the sentinel project id in foldedProjectIds.
    if (!foldedTopSet.has(LOCAL_FOLDER_PROJECT_ID)) {
      items.push(`project:${LOCAL_FOLDER_PROJECT_ID}`);
    }

    for (const project of filteredProjects) {
      if (foldedTopSet.has(project.id)) {
        continue;
      }

      items.push(`project:${project.id}`);
      const projectNodeIds = new Set(
        nonFolderWorkspaces.filter((workspace) => workspace.projectId === project.id).map((w) => w.nodeId),
      );
      for (const nodeId of projectNodeIds) {
        const nodeKey = `${project.id}:${nodeId}`;
        if (!foldedChildSet.has(nodeKey)) {
          items.push(`node:${nodeKey}`);
        }
      }
    }
    return items;
  }, [filteredProjects, foldedNodeKeys, foldedProjectIds, treeWorkspaces, workspaceListHierarchyMode]);

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
    treeNodes,
    treeWorkspaces,
    expandedTreeItems,
    displayWorkspaceIdByProjectId,
    workspaceByProjectId,
  };
}
