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

    for (const workspace of workspaces) {
      const existing = workspacesByProjectId.get(workspace.projectId);
      if (existing) {
        existing.push(workspace);
      } else {
        workspacesByProjectId.set(workspace.projectId, [workspace]);
      }
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
          });
        }
      }
    }

    return rows;
  }, [expandedItems, nodes, projects, workspaces]);

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
