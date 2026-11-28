import { supportsGitFeatures } from "@renderer/domains/project";
import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { useMemo, useState } from "react";
import type { WorkspaceTreeProject, WorkspaceTreeRow, WorkspaceTreeWorkspace } from "./types";

type UseVisibleWorkspaceTreeInput = {
  projects: WorkspaceTreeProject[];
  workspaces: WorkspaceTreeWorkspace[];
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
  workspaces,
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

    // Local-folder workspaces are synthetic rows that never map to a real
    // project, so they are split out and rendered under a dedicated group row.
    const folderWorkspaces = workspaces.filter((workspace) => workspace.isLocalFolder);
    const regularWorkspaces = workspaces.filter((workspace) => !workspace.isLocalFolder);
    const workspacesByProjectId = new Map<string, WorkspaceTreeWorkspace[]>();

    for (const workspace of regularWorkspaces) {
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
        supportsGitFeatures: project.supportsGitFeatures ?? supportsGitFeatures(undefined),
        isLocalFolderGroup: project.isLocalFolderGroup,
      });

      if (!expandedSet.has(projectRowId) || projectWorkspaces.length === 0) {
        continue;
      }

      for (const workspace of projectWorkspaces) {
        rows.push({
          id: toRowId("workspace", workspace.id),
          label: workspace.name,
          depth: 1,
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

    appendLocalFolderGroup(rows, folderWorkspaces, expandedSet, localFolderGroupLabel);
    return rows;
  }, [expandedItems, projects, workspaces, localFolderGroupLabel]);

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
 * to the visible row list. The group is a top-level anchor rendered whenever
 * at least one folder workspace exists.
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
