import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api } from "../../../api/client";
import type { WorkspaceTreeWorkspace } from "../../../components/WorkspaceTree";
import type { WorkspaceTreeNode, WorkspaceTreeProject } from "../../../components/WorkspaceTree/types";
import { filterVisibleProjects } from "../../../helpers/projectHelpers";
import { resolveWorkspaceListDisplayName } from "../../../helpers/workspaceDisplayNames";
import { resolveWorkspaceNotificationTone } from "../../../helpers/workspaceNotification";
import { chatStore } from "../../../store/chatStore";
import { sessionStore } from "../../../store/sessionStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { reconcileOrder } from "./projectListHelpers";

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
  workspaceByProjectId: Record<string, Array<ReturnType<typeof workspaceStore.getState>["workspaces"][number]>>;
};

/**
 * Derives the tree data structures (projects, nodes, workspaces, expanded items)
 * consumed by the WorkspaceTree component. All derivations are memoized.
 */
export function useProjectListTreeData(input: {
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
  foldedNodeKeys: string[];
  workspaceListHierarchyMode: "by_project" | "by_node";
}): ProjectListTreeDataResult {
  const { projectOrderIds, nodeOrderByParentId, foldedProjectIds, foldedNodeKeys, workspaceListHierarchyMode } = input;

  const projects = workspaceStore((state) => state.projects) ?? [];
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const displayProjectIds = workspaceStore((state) => state.displayProjectIds) ?? [];
  const gitChangeTotalsByWorkspaceId = workspaceStore((state) => state.gitChangeTotalsByWorkspaceId);
  const workspaceAgentStatusByWorkspaceId = chatStore((state) => state.workspaceAgentStatusByWorkspaceId);
  const workspaceUnreadToneByWorkspaceId = chatStore((state) => state.workspaceUnreadToneByWorkspaceId);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);

  const nodesQuery = useQuery({
    queryKey: ["org-nodes", selectedOrganizationId],
    queryFn: () => api.node.listByOrg(selectedOrganizationId as string),
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
    const projectById = new Map(
      filterVisibleProjects(projects, displayProjectIds).map((project) => [project.id, project]),
    );
    const orderedIds = projectOrderIds.filter((projectId) => projectById.has(projectId));
    const missingIds = Array.from(projectById.keys()).filter((projectId) => !orderedIds.includes(projectId));
    const nextIds = [...orderedIds, ...missingIds];
    return nextIds
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is NonNullable<typeof project> => Boolean(project));
  }, [displayProjectIds, projectOrderIds, projects]);

  const treeProjects = filteredProjects.map((project) => ({
    id: project.id,
    name: project.name,
    icon: project.icon,
    color: project.color,
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

      const parentNodeOrder = nodeOrderByParentId[`project:${project.id}`] ?? [];
      const nodeRankById = new Map(parentNodeOrder.map((nodeId, index) => [nodeId, index]));
      const sortedWorkspaces = [...displayedWorkspaces].sort((a, b) => {
        const nodeA = a.nodeId?.trim() || "unknown";
        const nodeB = b.nodeId?.trim() || "unknown";
        const rankA = nodeRankById.get(nodeA) ?? Number.MAX_SAFE_INTEGER;
        const rankB = nodeRankById.get(nodeB) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return 0;
      });

      for (const workspace of sortedWorkspaces) {
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
        });
      }
    }
    if (workspaceListHierarchyMode !== "by_node") {
      return rows;
    }

    const topNodeOrder = nodeOrderByParentId["root:node"] ?? [];
    const topNodeRankById = new Map(topNodeOrder.map((nodeId, index) => [nodeId, index]));
    return [...rows].sort((a, b) => {
      const rankNodeA = topNodeRankById.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER;
      const rankNodeB = topNodeRankById.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER;
      if (rankNodeA !== rankNodeB) {
        return rankNodeA - rankNodeB;
      }

      const projectOrder = nodeOrderByParentId[`node:${a.nodeId}`] ?? [];
      const projectRankById = new Map(projectOrder.map((projectId, index) => [projectId, index]));
      const rankProjectA = projectRankById.get(a.projectId) ?? Number.MAX_SAFE_INTEGER;
      const rankProjectB = projectRankById.get(b.projectId) ?? Number.MAX_SAFE_INTEGER;
      if (rankProjectA !== rankProjectB) {
        return rankProjectA - rankProjectB;
      }

      return 0;
    });
  }, [
    filteredProjects,
    gitChangeTotalsByWorkspaceId,
    nodeOrderByParentId,
    workspaceListHierarchyMode,
    workspaceAgentStatusByWorkspaceId,
    workspaceByProjectId,
    workspaceUnreadToneByWorkspaceId,
  ]);

  useEffect(() => {
    workspaceStore.getState().setOrderedWorkspaceIds(treeWorkspaces.map((workspace) => workspace.id));
  }, [treeWorkspaces]);

  const expandedTreeItems = useMemo(() => {
    const items: string[] = [];
    const foldedTopSet = new Set(foldedProjectIds);
    const foldedChildSet = new Set(foldedNodeKeys);

    if (workspaceListHierarchyMode === "by_node") {
      const nodeIds = Array.from(new Set(treeWorkspaces.map((workspace) => workspace.nodeId)));
      for (const nodeId of nodeIds) {
        if (foldedTopSet.has(nodeId)) {
          continue;
        }

        items.push(`node:${nodeId}`);
        const projectIds = Array.from(
          new Set(
            treeWorkspaces.filter((workspace) => workspace.nodeId === nodeId).map((workspace) => workspace.projectId),
          ),
        );
        for (const projectId of projectIds) {
          const projectKey = `${nodeId}:${projectId}`;
          if (!foldedChildSet.has(projectKey)) {
            items.push(`project:${projectKey}`);
          }
        }
      }
      return items;
    }

    for (const project of filteredProjects) {
      if (foldedTopSet.has(project.id)) {
        continue;
      }

      items.push(`project:${project.id}`);
      const projectNodeIds = new Set(
        treeWorkspaces.filter((workspace) => workspace.projectId === project.id).map((w) => w.nodeId),
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
