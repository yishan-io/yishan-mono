import { useCallback } from "react";
import { parseNodeRowNodeId, parseProjectRowProjectId, reconcileOrder, reorderIds } from "./projectListHelpers";

type TreeWorkspace = { id: string; projectId: string; nodeId: string };

type UseProjectListTreeHandlersInput = {
  workspaceListHierarchyMode: "by_project" | "by_node";
  treeWorkspaces: TreeWorkspace[];
  filteredProjects: Array<{ id: string }>;
  projectOrderIds: string[];
  nodeOrderByParentId: Record<string, string[]>;
  foldedProjectIds: string[];
  setFoldedProjectIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  setFoldedNodeKeys: (updater: string[] | ((prev: string[]) => string[])) => void;
  setProjectOrderIds: (next: string[]) => void;
  setNodeOrderByParentId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  setSelectedRepoId: (projectId: string) => void;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  reorderWorkspace: (input: {
    draggedWorkspaceId: string;
    targetWorkspaceId: string;
    position: "before" | "after";
  }) => void;
  closeWorkspaceMenus: () => void;
  closeProjectContextMenu: () => void;
  closeAllContextMenus: () => void;
  openProjectContextMenu: (input: { repoId: string; mouseX: number; mouseY: number }) => void;
  openWorkspaceContextMenu: (input: { repoId: string; workspaceId: string; mouseX: number; mouseY: number }) => void;
  setProjectActionsAnchorEl: (value: HTMLElement | null) => void;
  setProjectActionsProjectId: (value: string) => void;
  handleOpenCreateWorkspace: (projectId: string) => void;
  handleWorkspaceInfoMouseEnter: (workspaceId: string, anchorEl: HTMLElement) => void;
  handleWorkspaceInfoMouseLeave: () => void;
  handleRequestWorkspaceDeletion: (projectId: string, workspaceId: string) => void;
  handleRepairWorkspace: (workspaceId: string) => void;
  handleForgetWorkspace: (workspaceId: string) => void;
};

export function useProjectListTreeHandlers(input: UseProjectListTreeHandlersInput) {
  const {
    workspaceListHierarchyMode,
    treeWorkspaces,
    filteredProjects,
    projectOrderIds,
    nodeOrderByParentId,
    foldedProjectIds,
    setFoldedProjectIds,
    setFoldedNodeKeys,
    setProjectOrderIds,
    setNodeOrderByParentId,
    setSelectedRepoId,
    setSelectedWorkspaceId,
    reorderWorkspace,
    closeWorkspaceMenus,
    closeProjectContextMenu,
    closeAllContextMenus,
    openProjectContextMenu,
    openWorkspaceContextMenu,
    setProjectActionsAnchorEl,
    setProjectActionsProjectId,
    handleOpenCreateWorkspace,
    handleWorkspaceInfoMouseEnter,
    handleWorkspaceInfoMouseLeave,
    handleRequestWorkspaceDeletion,
    handleRepairWorkspace,
    handleForgetWorkspace,
  } = input;

  const onExpandedItemsChange = useCallback(
    (items: string[]) => {
      if (workspaceListHierarchyMode === "by_node") {
        const expandedNodeIds = new Set(
          items.filter((item) => item.startsWith("node:")).map((item) => item.replace(/^node:/, "")),
        );
        const expandedProjectKeys = new Set(
          items.filter((item) => item.startsWith("project:")).map((item) => item.replace(/^project:/, "")),
        );
        const visibleNodeIds = Array.from(new Set(treeWorkspaces.map((workspace) => workspace.nodeId)));
        const visibleProjectKeys = Array.from(
          new Set(treeWorkspaces.map((workspace) => `${workspace.nodeId}:${workspace.projectId}`)),
        );
        setFoldedProjectIds(visibleNodeIds.filter((nodeId) => !expandedNodeIds.has(nodeId)));
        setFoldedNodeKeys((current) => {
          const next = new Set(current);
          for (const projectKey of visibleProjectKeys) {
            const [nodeId] = projectKey.split(":");
            if (!nodeId || !expandedNodeIds.has(nodeId)) {
              continue;
            }

            if (expandedProjectKeys.has(projectKey)) {
              next.delete(projectKey);
            } else {
              const nodeWasPreviouslyFolded = foldedProjectIds.includes(nodeId);
              if (!nodeWasPreviouslyFolded) {
                next.add(projectKey);
              }
            }
          }
          return Array.from(next);
        });
        return;
      }

      const expandedProjectIds = new Set(
        items.filter((item) => item.startsWith("project:")).map((item) => item.replace(/^project:/, "")),
      );
      const expandedNodeKeys = new Set(
        items.filter((item) => item.startsWith("node:")).map((item) => item.replace(/^node:/, "")),
      );
      const nextFoldedProjectIds = filteredProjects
        .map((project) => project.id)
        .filter((projectId) => !expandedProjectIds.has(projectId));
      const visibleNodeKeys = Array.from(
        new Set(treeWorkspaces.map((workspace) => `${workspace.projectId}:${workspace.nodeId}`)),
      );
      setFoldedProjectIds(nextFoldedProjectIds);
      setFoldedNodeKeys((current) => {
        const next = new Set(current);
        for (const nodeKey of visibleNodeKeys) {
          const [projectId] = nodeKey.split(":");
          if (!projectId) {
            continue;
          }

          if (!expandedProjectIds.has(projectId)) {
            next.delete(nodeKey);
            continue;
          }

          if (expandedNodeKeys.has(nodeKey)) {
            next.delete(nodeKey);
          } else {
            const projectWasPreviouslyFolded = foldedProjectIds.includes(projectId);
            if (!projectWasPreviouslyFolded) {
              next.add(nodeKey);
            }
          }
        }
        return Array.from(next);
      });
    },
    [
      filteredProjects,
      foldedProjectIds,
      setFoldedNodeKeys,
      setFoldedProjectIds,
      treeWorkspaces,
      workspaceListHierarchyMode,
    ],
  );

  const onSelectProject = useCallback(
    (projectId: string) => {
      setSelectedRepoId(projectId);
      if (workspaceListHierarchyMode === "by_project") {
        setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
      }
    },
    [setFoldedProjectIds, setSelectedRepoId, workspaceListHierarchyMode],
  );

  const onSelectWorkspace = useCallback(
    (workspaceId: string, projectId: string) => {
      setSelectedRepoId(projectId);
      setSelectedWorkspaceId(workspaceId);
      setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
    },
    [setFoldedProjectIds, setSelectedRepoId, setSelectedWorkspaceId],
  );

  const onProjectContextMenu = useCallback(
    (event: React.MouseEvent, projectId: string) => {
      event.preventDefault();
      event.stopPropagation();
      closeWorkspaceMenus();
      setSelectedRepoId(projectId);
      openProjectContextMenu({ repoId: projectId, mouseX: event.clientX, mouseY: event.clientY });
    },
    [closeWorkspaceMenus, openProjectContextMenu, setSelectedRepoId],
  );

  const onProjectActionsClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, projectId: string) => {
      closeAllContextMenus();
      setSelectedRepoId(projectId);
      setProjectActionsAnchorEl(event.currentTarget);
      setProjectActionsProjectId(projectId);
    },
    [closeAllContextMenus, setProjectActionsAnchorEl, setProjectActionsProjectId, setSelectedRepoId],
  );

  const onProjectCreateWorkspaceClick = useCallback(
    (event: React.MouseEvent, projectId: string) => {
      event.preventDefault();
      event.stopPropagation();
      closeAllContextMenus();
      setSelectedRepoId(projectId);
      handleOpenCreateWorkspace(projectId);
    },
    [closeAllContextMenus, handleOpenCreateWorkspace, setSelectedRepoId],
  );

  const onWorkspaceContextMenu = useCallback(
    (event: React.MouseEvent, workspaceId: string, projectId: string) => {
      event.preventDefault();
      event.stopPropagation();
      closeProjectContextMenu();
      closeWorkspaceMenus();
      setSelectedRepoId(projectId);
      setSelectedWorkspaceId(workspaceId);
      openWorkspaceContextMenu({ repoId: projectId, workspaceId, mouseX: event.clientX, mouseY: event.clientY });
    },
    [closeProjectContextMenu, closeWorkspaceMenus, openWorkspaceContextMenu, setSelectedRepoId, setSelectedWorkspaceId],
  );

  const onWorkspaceMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLElement>, workspaceId: string) => {
      handleWorkspaceInfoMouseEnter(workspaceId, event.currentTarget);
    },
    [handleWorkspaceInfoMouseEnter],
  );

  const onRowReorder = useCallback(
    ({
      draggedRowId,
      targetRowId,
      rowKind,
      parentId,
      position,
    }: {
      draggedRowId: string;
      targetRowId: string;
      rowKind: "workspace" | "project" | "node";
      parentId: string | null;
      position: "before" | "after";
    }) => {
      if (rowKind === "workspace") {
        const draggedId = draggedRowId.replace(/^workspace:/, "");
        const targetId = targetRowId.replace(/^workspace:/, "");
        reorderWorkspace({ draggedWorkspaceId: draggedId, targetWorkspaceId: targetId, position });
        return;
      }

      if (rowKind === "project") {
        const draggedProjectId = parseProjectRowProjectId(draggedRowId);
        const targetProjectId = parseProjectRowProjectId(targetRowId);
        if (workspaceListHierarchyMode === "by_node" && parentId) {
          const parentNodeId = parentId.replace(/^node:/, "").split(":")[0] ?? "";
          const projectIdsUnderNode = Array.from(
            new Set(
              treeWorkspaces
                .filter((workspace) => workspace.nodeId === parentNodeId)
                .map((workspace) => workspace.projectId),
            ),
          );
          const currentOrder = reconcileOrder(nodeOrderByParentId[parentId] ?? [], projectIdsUnderNode);
          const nextOrder = reorderIds({
            ids: currentOrder,
            draggedId: draggedProjectId,
            targetId: targetProjectId,
            position,
          });
          setNodeOrderByParentId((current) => ({ ...current, [parentId]: nextOrder }));
          return;
        }

        const liveProjectIds = filteredProjects.map((project) => project.id);
        const nextProjectIds = reorderIds({
          ids: reconcileOrder(projectOrderIds, liveProjectIds),
          draggedId: draggedProjectId,
          targetId: targetProjectId,
          position,
        });
        setProjectOrderIds(nextProjectIds);
        return;
      }

      if (rowKind === "node") {
        const draggedNodeId = parseNodeRowNodeId(draggedRowId);
        const targetNodeId = parseNodeRowNodeId(targetRowId);
        const reorderParentId = parentId ?? "root:node";
        const nodeIdsUnderParent = Array.from(
          new Set(
            treeWorkspaces
              .filter((workspace) => {
                if (reorderParentId === "root:node") {
                  return true;
                }

                if (workspaceListHierarchyMode === "by_project") {
                  return `project:${workspace.projectId}` === reorderParentId;
                }

                return `node:${workspace.nodeId}` === reorderParentId;
              })
              .map((workspace) => workspace.nodeId),
          ),
        );
        const currentOrder = reconcileOrder(nodeOrderByParentId[reorderParentId] ?? [], nodeIdsUnderParent);
        const nextOrder = reorderIds({ ids: currentOrder, draggedId: draggedNodeId, targetId: targetNodeId, position });
        setNodeOrderByParentId((current) => ({ ...current, [reorderParentId]: nextOrder }));
      }
    },
    [
      filteredProjects,
      nodeOrderByParentId,
      projectOrderIds,
      reorderWorkspace,
      setNodeOrderByParentId,
      setProjectOrderIds,
      treeWorkspaces,
      workspaceListHierarchyMode,
    ],
  );

  return {
    onExpandedItemsChange,
    onSelectProject,
    onSelectWorkspace,
    onProjectContextMenu,
    onProjectActionsClick,
    onProjectCreateWorkspaceClick,
    onWorkspaceContextMenu,
    onWorkspaceMouseEnter,
    onWorkspaceMouseLeave: handleWorkspaceInfoMouseLeave,
    onWorkspaceRequestDelete: (workspaceId: string, projectId: string) => {
      handleRequestWorkspaceDeletion(projectId, workspaceId);
    },
    onWorkspaceRequestRepair: (workspaceId: string) => {
      handleRepairWorkspace(workspaceId);
    },
    onWorkspaceRequestForget: (workspaceId: string) => {
      handleForgetWorkspace(workspaceId);
    },
    onRowReorder,
  };
}
