import type React from "react";
import type { WorkspaceNotificationTone } from "../../../../helpers/workspaceNotification";
import type { WorkspaceAgentStatus } from "@renderer/features/agent";

export type WorkspaceTreeProject = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  /** False for non-git projects; hides workspace-creation affordances. */
  supportsGitFeatures?: boolean;
  /** Synthetic "Local Folders" group row; never a real project. */
  isLocalFolderGroup?: boolean;
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
  /** Non-git local folder workspace rendered under the synthetic group. */
  isLocalFolder?: boolean;
  additions?: number;
  deletions?: number;
  runtimeStatus?: WorkspaceAgentStatus;
  notificationTone?: WorkspaceNotificationTone;
  isCreating?: boolean;
  lifecycleState?: string;
  health?: string;
};

export type WorkspaceTreeRow = {
  id: string;
  label: string;
  depth: number;
  kind: "project" | "node" | "workspace";
  parentId: string | null;
  hasChildren: boolean;
  /** False for non-git projects; hides workspace-creation affordances. */
  supportsGitFeatures?: boolean;
  /** Synthetic "Local Folders" group row; never a real project. */
  isLocalFolderGroup?: boolean;
  icon?: string | null;
  color?: string | null;
  nodeKind?: "managed" | "external";
  nodeScope?: "private" | "shared";
  nodeIsOnline?: boolean;
  workspaceKind?: "managed" | "local";
  /** Non-git local folder workspace rendered under the synthetic group. */
  isLocalFolder?: boolean;
  additions?: number;
  deletions?: number;
  runtimeStatus?: WorkspaceAgentStatus;
  notificationTone?: WorkspaceNotificationTone;
  isCreating?: boolean;
  lifecycleState?: string;
  health?: string;
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
  /** Translated label for the synthetic "Local Folders" group row. */
  localFolderGroupLabel?: string;
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
