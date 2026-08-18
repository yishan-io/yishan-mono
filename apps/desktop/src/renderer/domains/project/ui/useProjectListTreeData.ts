import { useWorkspaceGitChangeTotalsByWorkspaceId } from "@renderer/domains/git";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import { setOrderedWorkspaceIds, useWorkspaces } from "@renderer/domains/workspace";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  useWorkspaceAgentStatusByWorkspaceId,
  useWorkspaceUnreadToneByWorkspaceId,
} from "../../../domains/agent/ui/hooks/useAgentChatReadHooks";
import { listOrgNodes } from "../../../domains/node/commands/nodeCommands";
import { LOCAL_FOLDER_PROJECT_ID } from "../../../domains/project/model/projectTypes";
import { useDisplayProjectIds, useProjects } from "../../../domains/project/ui/hooks/useProjectReadHooks";
import { useSelectedOrganizationId } from "../../../domains/session";
import { supportsGitFeatures } from "../../../helpers/projectGitCapability";
import { filterVisibleProjects } from "../../../helpers/projectHelpers";
import { resolveWorkspaceListDisplayName } from "../../../helpers/workspaceDisplayNames";
import { resolveWorkspaceNotificationTone } from "../../../helpers/workspaceNotification";
import { reconcileOrder } from "./projectListHelpers";
import type { WorkspaceTreeWorkspace } from "./workspace-tree";
import type { WorkspaceTreeNode, WorkspaceTreeProject } from "./workspace-tree/types";

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
export function useProjectListTreeData(input: {
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

  const projects = useProjects();
  const workspaces = useWorkspaces() ?? [];
  const displayProjectIds = useDisplayProjectIds();
  const gitChangeTotalsByWorkspaceId = useWorkspaceGitChangeTotalsByWorkspaceId();
  const workspaceAgentStatusByWorkspaceId = useWorkspaceAgentStatusByWorkspaceId();
  const workspaceUnreadToneByWorkspaceId = useWorkspaceUnreadToneByWorkspaceId();
  const selectedOrganizationId = useSelectedOrganizationId();

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

      const parentNodeOrder = nodeOrderByParentId[`project:${project.id}`] ?? [];
      const nodeRankById = new Map(parentNodeOrder.map((nodeId, index) => [nodeId, index]));
      const workspaceRankCache = new Map<string, Map<string, number>>();
      const getWorkspaceRank = (projectId: string, nodeId: string, workspaceId: string) => {
        const parentKey = `${projectId}:${nodeId}`;
        let rankById = workspaceRankCache.get(parentKey);
        if (!rankById) {
          rankById = new Map((workspaceOrderByParentId[parentKey] ?? []).map((id, index) => [id, index]));
          workspaceRankCache.set(parentKey, rankById);
        }
        return rankById.get(workspaceId) ?? Number.MAX_SAFE_INTEGER;
      };
      const sortedWorkspaces = [...displayedWorkspaces].sort((a, b) => {
        const nodeA = a.nodeId?.trim() || "unknown";
        const nodeB = b.nodeId?.trim() || "unknown";
        const rankA = nodeRankById.get(nodeA) ?? Number.MAX_SAFE_INTEGER;
        const rankB = nodeRankById.get(nodeB) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        if (nodeA === nodeB) {
          const workspaceRankA = getWorkspaceRank(project.id, nodeA, a.id);
          const workspaceRankB = getWorkspaceRank(project.id, nodeB, b.id);
          if (workspaceRankA !== workspaceRankB) {
            return workspaceRankA - workspaceRankB;
          }
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
    workspaceOrderByParentId,
    workspaceListHierarchyMode,
    workspaceAgentStatusByWorkspaceId,
    workspaceByProjectId,
    workspaceUnreadToneByWorkspaceId,
    workspaces,
  ]);

  useEffect(() => {
    setOrderedWorkspaceIds(treeWorkspaces.map((workspace) => workspace.id));
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
