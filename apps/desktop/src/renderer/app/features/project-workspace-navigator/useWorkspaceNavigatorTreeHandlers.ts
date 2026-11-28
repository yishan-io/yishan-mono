import { LOCAL_FOLDER_PROJECT_ID } from "@shared/workspace/localFolderProjectId";
import { useCallback } from "react";
import { parseProjectRowProjectId, reconcileOrder, reorderIds } from "./workspaceNavigatorOrder";

type TreeWorkspace = { id: string; projectId: string; nodeId: string; isLocalFolder?: boolean };

type UseWorkspaceNavigatorTreeHandlersInput = {
  treeWorkspaces: TreeWorkspace[];
  filteredProjects: Array<{ id: string }>;
  projectOrderIds: string[];
  workspaceOrderByParentId: Record<string, string[]>;
  setFoldedProjectIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  setProjectOrderIds: (next: string[]) => void;
  setWorkspaceOrderByParentId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  activateProject: (input: { projectId: string; workspaceId?: string }) => void;
  activateWorkspace: (input: { workspaceId: string; projectId?: string }) => void;
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
};

export function useWorkspaceNavigatorTreeHandlers(input: UseWorkspaceNavigatorTreeHandlersInput) {
  const {
    treeWorkspaces,
    filteredProjects,
    projectOrderIds,
    workspaceOrderByParentId,
    setFoldedProjectIds,
    setProjectOrderIds,
    setWorkspaceOrderByParentId,
    activateProject,
    activateWorkspace,
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
  } = input;

  const onExpandedItemsChange = useCallback(
    (items: string[]) => {
      const expandedProjectIds = new Set(
        items.filter((item) => item.startsWith("project:")).map((item) => item.replace(/^project:/, "")),
      );
      const nextFoldedProjectIds = filteredProjects
        .map((project) => project.id)
        .filter((projectId) => !expandedProjectIds.has(projectId));
      // The synthetic "Local Folders" group is not in filteredProjects, so the
      // sentinel id must be folded/unfolded explicitly to persist its state.
      if (!expandedProjectIds.has(LOCAL_FOLDER_PROJECT_ID)) {
        nextFoldedProjectIds.push(LOCAL_FOLDER_PROJECT_ID);
      }
      setFoldedProjectIds(nextFoldedProjectIds);
    },
    [filteredProjects, setFoldedProjectIds],
  );

  const onSelectProject = useCallback(
    (projectId: string) => {
      activateProject({ projectId });
      setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
    },
    [setFoldedProjectIds, activateProject],
  );

  const onSelectWorkspace = useCallback(
    (workspaceId: string, projectId: string) => {
      activateWorkspace({ workspaceId, projectId });
      setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
    },
    [setFoldedProjectIds, activateWorkspace],
  );

  const onProjectContextMenu = useCallback(
    (event: React.MouseEvent, projectId: string) => {
      event.preventDefault();
      event.stopPropagation();
      closeWorkspaceMenus();
      activateProject({ projectId });
      openProjectContextMenu({ repoId: projectId, mouseX: event.clientX, mouseY: event.clientY });
    },
    [closeWorkspaceMenus, openProjectContextMenu, activateProject],
  );

  const onProjectActionsClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, projectId: string) => {
      closeAllContextMenus();
      activateProject({ projectId });
      setProjectActionsAnchorEl(event.currentTarget);
      setProjectActionsProjectId(projectId);
    },
    [closeAllContextMenus, setProjectActionsAnchorEl, setProjectActionsProjectId, activateProject],
  );

  const onProjectCreateWorkspaceClick = useCallback(
    (event: React.MouseEvent, projectId: string) => {
      event.preventDefault();
      event.stopPropagation();
      closeAllContextMenus();
      activateProject({ projectId });
      handleOpenCreateWorkspace(projectId);
    },
    [closeAllContextMenus, handleOpenCreateWorkspace, activateProject],
  );

  const onWorkspaceContextMenu = useCallback(
    (event: React.MouseEvent, workspaceId: string, projectId: string) => {
      event.preventDefault();
      event.stopPropagation();
      closeProjectContextMenu();
      closeWorkspaceMenus();
      activateWorkspace({ workspaceId, projectId });
      openWorkspaceContextMenu({ repoId: projectId, workspaceId, mouseX: event.clientX, mouseY: event.clientY });
    },
    [closeProjectContextMenu, closeWorkspaceMenus, openWorkspaceContextMenu, activateWorkspace],
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
      position,
    }: {
      draggedRowId: string;
      targetRowId: string;
      rowKind: "workspace" | "project";
      position: "before" | "after";
    }) => {
      if (rowKind === "workspace") {
        const draggedId = draggedRowId.replace(/^workspace:/, "");
        const targetId = targetRowId.replace(/^workspace:/, "");
        reorderWorkspace({ draggedWorkspaceId: draggedId, targetWorkspaceId: targetId, position });
        // Record the intra-project workspace order in the persisted order bucket
        // (keyed projectId:nodeId, nodeId being the current daemon node) so the reorder survives snapshot reloads
        // and app restarts. Mirrors the same-project same-node guard of the
        // store-level reorderWorkspace action.
        const draggedWorkspace = treeWorkspaces.find((workspace) => workspace.id === draggedId);
        const targetWorkspace = treeWorkspaces.find((workspace) => workspace.id === targetId);
        if (
          draggedWorkspace &&
          targetWorkspace &&
          draggedWorkspace.projectId === targetWorkspace.projectId &&
          draggedWorkspace.nodeId === targetWorkspace.nodeId
        ) {
          const parentKey = `${draggedWorkspace.projectId}:${draggedWorkspace.nodeId}`;
          const liveWorkspaceIds = treeWorkspaces
            .filter(
              (workspace) =>
                workspace.projectId === draggedWorkspace.projectId && workspace.nodeId === draggedWorkspace.nodeId,
            )
            .map((workspace) => workspace.id);
          const currentOrder = reconcileOrder(workspaceOrderByParentId[parentKey] ?? [], liveWorkspaceIds);
          const nextOrder = reorderIds({
            ids: currentOrder,
            draggedId,
            targetId,
            position,
          });
          setWorkspaceOrderByParentId((current) => ({ ...current, [parentKey]: nextOrder }));
        }
        return;
      }

      if (rowKind === "project") {
        const draggedProjectId = parseProjectRowProjectId(draggedRowId);
        const targetProjectId = parseProjectRowProjectId(targetRowId);
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
    },
    [
      filteredProjects,
      projectOrderIds,
      reorderWorkspace,
      setProjectOrderIds,
      setWorkspaceOrderByParentId,
      treeWorkspaces,
      workspaceOrderByParentId,
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
    onRowReorder,
  };
}
