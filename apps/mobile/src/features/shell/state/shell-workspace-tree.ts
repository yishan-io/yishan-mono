import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";

// Owns pure workspace-tree projection from projects/nodes into drawer-ready groupings.
export type WorkspaceListHierarchyMode = "by_project" | "by_node";

export type ProjectWorkspaceGroup = {
  project: ProjectWithWorkspaces;
  workspaces: Workspace[];
};

export type ProjectNodeGroup = {
  project: ProjectWithWorkspaces;
  nodes: Array<{
    nodeId: string;
    nodeKind?: Node["kind"];
    nodeName: string;
    nodeScope?: Node["scope"];
    workspaces: Workspace[];
  }>;
};

export type NodeWorkspaceGroup = {
  nodeId: string;
  nodeKind?: Node["kind"];
  nodeName: string;
  nodeScope?: Node["scope"];
  projects: ProjectWorkspaceGroup[];
};

export function buildNodeWorkspaceGroups({
  currentNodes,
  projects,
  workspacesByProjectId,
}: {
  currentNodes: Node[];
  projects: ProjectWithWorkspaces[];
  workspacesByProjectId?: Record<string, Workspace[]>;
}): NodeWorkspaceGroup[] {
  const nodeById = new Map(currentNodes.map((node) => [node.id, node] as const));
  const groupedByNodeId = new Map<string, NodeWorkspaceGroup>();

  for (const project of projects) {
    const projectWorkspaces = workspacesByProjectId?.[project.id] ?? project.workspaces;
    for (const workspace of projectWorkspaces) {
      const existingNodeGroup = groupedByNodeId.get(workspace.nodeId);
      const nodeGroup = existingNodeGroup ?? {
        nodeId: workspace.nodeId,
        nodeKind: nodeById.get(workspace.nodeId)?.kind,
        nodeName: nodeById.get(workspace.nodeId)?.name ?? "Unknown node",
        nodeScope: nodeById.get(workspace.nodeId)?.scope,
        projects: [],
      };

      let projectGroup = nodeGroup.projects.find((item) => item.project.id === project.id);
      if (!projectGroup) {
        projectGroup = {
          project,
          workspaces: [],
        };
        nodeGroup.projects.push(projectGroup);
      }

      projectGroup.workspaces.push(workspace);
      if (!existingNodeGroup) {
        groupedByNodeId.set(workspace.nodeId, nodeGroup);
      }
    }
  }

  const orderedNodeIds = [
    ...currentNodes.map((node) => node.id),
    ...Array.from(groupedByNodeId.keys()).filter((nodeId) => !nodeById.has(nodeId)),
  ];

  return orderedNodeIds.flatMap((nodeId) => {
    const nodeGroup = groupedByNodeId.get(nodeId);
    return nodeGroup && nodeGroup.projects.length > 0 ? [nodeGroup] : [];
  });
}

export function buildProjectNodeGroups({
  currentNodes,
  projects,
  workspacesByProjectId,
}: {
  currentNodes: Node[];
  projects: ProjectWithWorkspaces[];
  workspacesByProjectId?: Record<string, Workspace[]>;
}): ProjectNodeGroup[] {
  const nodeById = new Map(currentNodes.map((node) => [node.id, node] as const));

  return projects.flatMap((project) => {
    const projectWorkspaces = workspacesByProjectId?.[project.id] ?? project.workspaces;
    if (projectWorkspaces.length === 0) {
      return [];
    }

    const workspacesByNodeId = new Map<string, Workspace[]>();
    for (const workspace of projectWorkspaces) {
      const existing = workspacesByNodeId.get(workspace.nodeId);
      if (existing) {
        existing.push(workspace);
      } else {
        workspacesByNodeId.set(workspace.nodeId, [workspace]);
      }
    }

    const nodeIds = [
      ...currentNodes.map((node) => node.id).filter((nodeId) => workspacesByNodeId.has(nodeId)),
      ...Array.from(workspacesByNodeId.keys()).filter((nodeId) => !nodeById.has(nodeId)),
    ];

    return [
      {
        project,
        nodes: nodeIds.flatMap((nodeId) => {
          const workspaces = workspacesByNodeId.get(nodeId);
          if (!workspaces?.length) {
            return [];
          }

          return [
            {
              nodeId,
              nodeKind: nodeById.get(nodeId)?.kind,
              nodeName: nodeById.get(nodeId)?.name ?? "Unknown node",
              nodeScope: nodeById.get(nodeId)?.scope,
              workspaces,
            },
          ];
        }),
      },
    ];
  });
}
