import { useMemo, useState } from "react";
import type {
  WorkspaceTreeNode,
  WorkspaceTreeProject,
  WorkspaceTreeRow,
  WorkspaceTreeWorkspace,
} from "./types";

type UseVisibleWorkspaceTreeInput = {
  projects: WorkspaceTreeProject[];
  nodes: WorkspaceTreeNode[];
  workspaces: WorkspaceTreeWorkspace[];
  hierarchyMode?: "by_project" | "by_node";
  expandedItemsOverride?: string[];
  onExpandedItemsChange?: (items: string[]) => void;
};

type UseVisibleWorkspaceTreeOutput = {
  visibleRows: WorkspaceTreeRow[];
  expandedItems: string[];
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string) => void;
};

function toRowId(kind: WorkspaceTreeRow["kind"], id: string): string {
  return `${kind}:${id}`;
}

export function useVisibleWorkspaceTree({
  projects,
  nodes,
  workspaces,
  hierarchyMode = "by_project",
  expandedItemsOverride,
  onExpandedItemsChange,
}: UseVisibleWorkspaceTreeInput): UseVisibleWorkspaceTreeOutput {
  const [internalExpandedItems, setInternalExpandedItems] = useState<string[]>([]);
  const expandedItems = expandedItemsOverride ?? internalExpandedItems;

  const setExpandedItems = (updater: (currentItems: string[]) => string[]) => {
    const nextItems = updater(expandedItems);
    if (expandedItemsOverride) {
      onExpandedItemsChange?.(nextItems);
      return;
    }

    setInternalExpandedItems(nextItems);
    onExpandedItemsChange?.(nextItems);
  };

  const visibleRows = useMemo(() => {
    const rows: WorkspaceTreeRow[] = [];
    const expandedSet = new Set(expandedItems);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const workspacesByProjectId = new Map<string, WorkspaceTreeWorkspace[]>();
    const projectById = new Map(projects.map((project) => [project.id, project]));

    for (const workspace of workspaces) {
      const existing = workspacesByProjectId.get(workspace.projectId);
      if (existing) {
        existing.push(workspace);
      } else {
        workspacesByProjectId.set(workspace.projectId, [workspace]);
      }
    }

    if (hierarchyMode === "by_node") {
      const workspacesByNodeId = new Map<string, WorkspaceTreeWorkspace[]>();
      for (const workspace of workspaces) {
        const existing = workspacesByNodeId.get(workspace.nodeId);
        if (existing) {
          existing.push(workspace);
        } else {
          workspacesByNodeId.set(workspace.nodeId, [workspace]);
        }
      }

      for (const [nodeId, nodeWorkspaces] of workspacesByNodeId) {
        if (nodeWorkspaces.length === 0) {
          continue;
        }

        const node = nodeById.get(nodeId);
        const nodeRowId = toRowId("node", nodeId);
        rows.push({
          id: nodeRowId,
          label: node?.name ?? "Unknown node",
          depth: 0,
          kind: "node",
          parentId: null,
          hasChildren: true,
          nodeKind: node?.kind,
          nodeScope: node?.scope,
          nodeIsOnline: node?.isOnline,
        });

        if (!expandedSet.has(nodeRowId)) {
          continue;
        }

        const nodeWorkspacesByProjectId = new Map<string, WorkspaceTreeWorkspace[]>();
        for (const workspace of nodeWorkspaces) {
          const existing = nodeWorkspacesByProjectId.get(workspace.projectId);
          if (existing) {
            existing.push(workspace);
          } else {
            nodeWorkspacesByProjectId.set(workspace.projectId, [workspace]);
          }
        }

        for (const [projectId, projectWorkspaces] of nodeWorkspacesByProjectId) {
          const project = projectById.get(projectId);
          if (!project || projectWorkspaces.length === 0) {
            continue;
          }

          const projectRowId = toRowId("project", `${nodeId}:${projectId}`);
          rows.push({
            id: projectRowId,
            label: project.name,
            depth: 1,
            kind: "project",
            parentId: nodeRowId,
            hasChildren: true,
            icon: project.icon,
            color: project.color,
          });

          if (!expandedSet.has(projectRowId)) {
            continue;
          }

          for (const workspace of projectWorkspaces) {
            rows.push({
              id: toRowId("workspace", workspace.id),
              label: workspace.name,
              depth: 2,
              kind: "workspace",
              parentId: projectRowId,
              hasChildren: false,
              workspaceKind: workspace.kind,
              additions: workspace.additions,
              deletions: workspace.deletions,
              runtimeStatus: workspace.runtimeStatus,
              notificationTone: workspace.notificationTone,
              isCreating: workspace.isCreating,
            });
          }
        }
      }

      return rows;
    }

    for (const project of projects) {
      const projectRowId = toRowId("project", project.id);
      const projectWorkspaces = workspacesByProjectId.get(project.id) ?? [];
      rows.push({
        id: projectRowId,
        label: project.name,
        depth: 0,
        kind: "project",
        parentId: null,
        hasChildren: projectWorkspaces.length > 0,
        icon: project.icon,
        color: project.color,
      });

      if (!expandedSet.has(projectRowId) || projectWorkspaces.length === 0) {
        continue;
      }

      const workspacesByNodeId = new Map<string, WorkspaceTreeWorkspace[]>();
      for (const workspace of projectWorkspaces) {
        const existing = workspacesByNodeId.get(workspace.nodeId);
        if (existing) {
          existing.push(workspace);
        } else {
          workspacesByNodeId.set(workspace.nodeId, [workspace]);
        }
      }

      for (const [nodeId, nodeWorkspaces] of workspacesByNodeId) {
        if (nodeWorkspaces.length === 0) {
          continue;
        }

        const node = nodeById.get(nodeId);
        const nodeLabel = node?.name ?? "Unknown node";
        const nodeRowId = toRowId("node", `${project.id}:${nodeId}`);
        rows.push({
          id: nodeRowId,
          label: nodeLabel,
          depth: 1,
          kind: "node",
          parentId: projectRowId,
          hasChildren: true,
          nodeKind: node?.kind,
          nodeScope: node?.scope,
          nodeIsOnline: node?.isOnline,
        });

        if (!expandedSet.has(nodeRowId)) {
          continue;
        }

        for (const workspace of nodeWorkspaces) {
          rows.push({
            id: toRowId("workspace", workspace.id),
            label: workspace.name,
            depth: 2,
            kind: "workspace",
            parentId: nodeRowId,
            hasChildren: false,
            workspaceKind: workspace.kind,
            additions: workspace.additions,
            deletions: workspace.deletions,
            runtimeStatus: workspace.runtimeStatus,
            notificationTone: workspace.notificationTone,
            isCreating: workspace.isCreating,
          });
        }
      }
    }

    return rows;
  }, [expandedItems, hierarchyMode, nodes, projects, workspaces]);

  const isExpanded = (id: string) => expandedItems.includes(id);

  const toggleExpanded = (id: string) => {
    setExpandedItems((currentItems) =>
      currentItems.includes(id) ? currentItems.filter((item) => item !== id) : [...currentItems, id],
    );
  };

  return {
    visibleRows,
    expandedItems,
    isExpanded,
    toggleExpanded,
  };
}
