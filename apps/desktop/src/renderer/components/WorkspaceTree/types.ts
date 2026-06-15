import type React from "react";

export type WorkspaceTreeProject = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
};

export type WorkspaceTreeNode = {
  id: string;
  name: string;
  kind?: "managed" | "external";
  scope?: "private" | "shared";
  isOnline?: boolean;
};

export type WorkspaceTreeWorkspace = {
  id: string;
  name: string;
  projectId: string;
  nodeId: string;
  kind?: "managed" | "local";
  additions?: number;
  deletions?: number;
  runtimeStatus?: "running" | "waiting_input" | "idle";
  notificationTone?: "none" | "waiting_input" | "done" | "failed";
  isCreating?: boolean;
  lifecycleState?: string;
};

export type WorkspaceTreeRow = {
  id: string;
  label: string;
  depth: number;
  kind: "project" | "node" | "workspace";
  parentId: string | null;
  hasChildren: boolean;
  icon?: string | null;
  color?: string | null;
  nodeKind?: "managed" | "external";
  nodeScope?: "private" | "shared";
  nodeIsOnline?: boolean;
  workspaceKind?: "managed" | "local";
  additions?: number;
  deletions?: number;
  runtimeStatus?: "running" | "waiting_input" | "idle";
  notificationTone?: "none" | "waiting_input" | "done" | "failed";
  isCreating?: boolean;
  lifecycleState?: string;
};

export type WorkspaceTreeProps = {
  projects: WorkspaceTreeProject[];
  nodes: WorkspaceTreeNode[];
  workspaces: WorkspaceTreeWorkspace[];
  selectedProjectId?: string;
  selectedNodeId?: string;
  selectedWorkspaceId?: string;
  hierarchyMode?: "by_project" | "by_node";
  expandedItems?: string[];
  onExpandedItemsChange?: (items: string[]) => void;
  onSelectProject?: (projectId: string) => void;
  onSelectNode?: (nodeId: string, projectId: string) => void;
  onSelectWorkspace?: (workspaceId: string, projectId: string, nodeId: string) => void;
  deleteWorkspaceLabel?: string;
  onProjectContextMenu?: (event: React.MouseEvent<HTMLElement>, projectId: string) => void;
  onWorkspaceContextMenu?: (event: React.MouseEvent<HTMLElement>, workspaceId: string, projectId: string) => void;
  onWorkspaceMouseEnter?: (event: React.MouseEvent<HTMLElement>, workspaceId: string) => void;
  onWorkspaceMouseLeave?: () => void;
  onWorkspaceRequestDelete?: (workspaceId: string, projectId: string) => void;
  onWorkspaceRequestRepair?: (workspaceId: string) => void;
  onWorkspaceRequestForget?: (workspaceId: string) => void;
  createWorkspaceTooltipLabel?: string;
  onProjectCreateWorkspaceClick?: (event: React.MouseEvent<HTMLElement>, projectId: string) => void;
  onProjectActionsClick?: (event: React.MouseEvent<HTMLElement>, projectId: string) => void;
  onRowReorder?: (input: {
    draggedRowId: string;
    targetRowId: string;
    rowKind: WorkspaceTreeRow["kind"];
    parentId: string | null;
    position: "before" | "after";
  }) => void;
};
