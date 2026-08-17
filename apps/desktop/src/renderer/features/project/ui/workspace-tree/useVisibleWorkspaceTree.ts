import { useMemo, useState } from "react";
import { LOCAL_FOLDER_PROJECT_ID } from "../../../../features/project/model/projectTypes";
import { supportsGitFeatures } from "../../../../helpers/projectGitCapability";
import type { WorkspaceTreeNode, WorkspaceTreeProject, WorkspaceTreeRow, WorkspaceTreeWorkspace } from "./types";

type UseVisibleWorkspaceTreeInput = {
  projects: WorkspaceTreeProject[];
  nodes: WorkspaceTreeNode[];
  workspaces: WorkspaceTreeWorkspace[];
  hierarchyMode?: "by_project" | "by_node";
  expandedItemsOverride?: string[];
  onExpandedItemsChange?: (items: string[]) => void;
  /** Translated label for the synthetic "Local Folders" group row. */
  localFolderGroupLabel?: string;
};

type UseVisibleWorkspaceTreeOutput = {
  visibleRows: WorkspaceTreeRow[];
  expandedItems: string[];
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string) => void;
};

const LOCAL_FOLDER_GROUP_ID = LOCAL_FOLDER_PROJECT_ID;

function toRowId(kind: WorkspaceTreeRow["kind"], id: string): string {
  return `${kind}:${id}`;
}

/** Builds a non-git local-folder workspace row nested under a Local Folders group. */
function toLocalFolderRow(workspace: WorkspaceTreeWorkspace, parentId: string, depth = 1): WorkspaceTreeRow {
  return {
    id: toRowId("workspace", workspace.id),
    label: workspace.name,
    depth,
    kind: "workspace",
    parentId,
    hasChildren: false,
    isLocalFolder: true,
    lifecycleState: workspace.lifecycleState,
    health: workspace.health,
  };
}

export function useVisibleWorkspaceTree({
  projects,
  nodes,
  workspaces,
  hierarchyMode = "by_project",
  expandedItemsOverride,
  onExpandedItemsChange,
  localFolderGroupLabel = "Local Folders",
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

    // Local-folder workspaces are synthetic rows that never map to a real
    // project, so they are split out and rendered under a dedicated group row.
    const folderWorkspaces = workspaces.filter((workspace) => workspace.isLocalFolder);
    const regularWorkspaces = workspaces.filter((workspace) => !workspace.isLocalFolder);
    const workspacesByProjectId = new Map<string, WorkspaceTreeWorkspace[]>();
    const projectById = new Map(projects.map((project) => [project.id, project]));

    for (const workspace of regularWorkspaces) {
      const existing = workspacesByProjectId.get(workspace.projectId);
      if (existing) {
        existing.push(workspace);
      } else {
        workspacesByProjectId.set(workspace.projectId, [workspace]);
      }
    }

    if (hierarchyMode === "by_node") {
      const regularWorkspacesByNodeId = new Map<string, WorkspaceTreeWorkspace[]>();
      const folderWorkspacesByNodeId = new Map<string, WorkspaceTreeWorkspace[]>();
      for (const workspace of regularWorkspaces) {
        const existing = regularWorkspacesByNodeId.get(workspace.nodeId);
        if (existing) {
          existing.push(workspace);
        } else {
          regularWorkspacesByNodeId.set(workspace.nodeId, [workspace]);
        }
      }
      for (const workspace of folderWorkspaces) {
        const existing = folderWorkspacesByNodeId.get(workspace.nodeId);
        if (existing) {
          existing.push(workspace);
        } else {
          folderWorkspacesByNodeId.set(workspace.nodeId, [workspace]);
        }
      }

      // A node that hosts only folder workspaces must still render its row, so
      // the node loop unions regular and folder node ids.
      const nodeIds = Array.from(new Set([...regularWorkspacesByNodeId.keys(), ...folderWorkspacesByNodeId.keys()]));

      for (const nodeId of nodeIds) {
        const nodeWorkspaces = regularWorkspacesByNodeId.get(nodeId) ?? [];
        const nodeFolderWorkspaces = folderWorkspacesByNodeId.get(nodeId) ?? [];
        if (nodeWorkspaces.length === 0 && nodeFolderWorkspaces.length === 0) {
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
            supportsGitFeatures: project.supportsGitFeatures ?? supportsGitFeatures(undefined),
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
              lifecycleState: workspace.lifecycleState,
              health: workspace.health,
            });
          }
        }

        // Local-folder workspaces render under a per-node "Local Folders"
        // group row, so every machine that hosts folders gets its own group.
        if (nodeFolderWorkspaces.length > 0) {
          const folderGroupRowId = toRowId("project", `${nodeId}:${LOCAL_FOLDER_GROUP_ID}`);
          rows.push({
            id: folderGroupRowId,
            label: localFolderGroupLabel,
            depth: 1,
            kind: "project",
            parentId: nodeRowId,
            hasChildren: true,
            supportsGitFeatures: false,
            isLocalFolderGroup: true,
          });

          if (expandedSet.has(folderGroupRowId)) {
            for (const workspace of nodeFolderWorkspaces) {
              rows.push(toLocalFolderRow(workspace, folderGroupRowId, 2));
            }
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
        supportsGitFeatures: project.supportsGitFeatures ?? supportsGitFeatures(undefined),
        isLocalFolderGroup: project.isLocalFolderGroup,
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
            lifecycleState: workspace.lifecycleState,
            health: workspace.health,
          });
        }
      }
    }

    appendLocalFolderGroup(rows, folderWorkspaces, expandedSet, localFolderGroupLabel);
    return rows;
  }, [expandedItems, hierarchyMode, nodes, projects, workspaces, localFolderGroupLabel]);

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

/**
 * Appends the synthetic "Local Folders" group row (and its child folder rows)
 * to the visible row list. Used in by_project mode, where the group is a
 * top-level anchor rendered whenever at least one folder workspace exists. In
 * by_node mode folder workspaces are rendered as children of their node row
 * instead, so this group is not appended there.
 */
function appendLocalFolderGroup(
  rows: WorkspaceTreeRow[],
  folderWorkspaces: WorkspaceTreeWorkspace[],
  expandedSet: Set<string>,
  label: string,
): void {
  if (folderWorkspaces.length === 0) {
    return;
  }

  const groupRowId = toRowId("project", LOCAL_FOLDER_GROUP_ID);
  rows.push({
    id: groupRowId,
    label,
    depth: 0,
    kind: "project",
    parentId: null,
    hasChildren: true,
    supportsGitFeatures: false,
    isLocalFolderGroup: true,
  });

  if (!expandedSet.has(groupRowId)) {
    return;
  }

  for (const workspace of folderWorkspaces) {
    rows.push(toLocalFolderRow(workspace, groupRowId));
  }
}
