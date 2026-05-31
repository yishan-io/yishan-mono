import { Box } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuSettings, LuTrash2 } from "react-icons/lu";
import {
  EXTERNAL_APP_MENU_ENTRIES,
  type ExternalAppId,
  JETBRAINS_EXTERNAL_APP_IDS,
  SYSTEM_FILE_MANAGER_APP_ID,
  findExternalAppPreset,
  isExternalAppPlatformSupported,
} from "../../../../shared/contracts/externalApps";
import { OPEN_CREATE_WORKSPACE_DIALOG_EVENT } from "../../../commands/workspaceCommands";
import { ContextMenu, type ContextMenuEntry } from "../../../components/ContextMenu";
import { WorkspaceTree } from "../../../components/WorkspaceTree";
import type { WorkspaceTreeWorkspace } from "../../../components/WorkspaceTree";
import type { WorkspaceTreeRow } from "../../../components/WorkspaceTree/types";
import { getRendererPlatform } from "../../../helpers/platform";
import { useCommands } from "../../../hooks/useCommands";
import { useContextMenuState } from "../../../hooks/useContextMenuState";
import { useSuppressNativeContextMenuWhileOpen } from "../../../hooks/useSuppressNativeContextMenuWhileOpen";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { chatStore } from "../../../store/chatStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { ProjectListMenus } from "./ProjectListMenus";
import { WorkspaceDeleteDialogView } from "./WorkspaceDeleteDialogView";
import { WorkspaceInfoPopperView } from "./WorkspaceInfoPopperView";
import { parseNodeRowNodeId, parseProjectRowProjectId, reconcileOrder, reorderIds } from "./projectListHelpers";
import { useProjectDeletionFlow } from "./useProjectDeletionFlow";
import { useProjectListDialogState } from "./useProjectListDialogState";
import { useProjectListFoldState } from "./useProjectListFoldState";
import { useProjectListTreeHandlers } from "./useProjectListTreeHandlers";
import { useProjectListTreeData } from "./useProjectListTreeData";
import { useWorkspaceDeletionFlow } from "./useWorkspaceDeletionFlow";
import { useWorkspaceInfoHover } from "./useWorkspaceInfoHover";

/** Renders project rows and nested workspace rows with per-project fold controls. */
export function ProjectListView() {
  const { t } = useTranslation();
  const projects = workspaceStore((state) => state.projects) ?? [];
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const lastUsedExternalAppId = workspaceStore((state) => state.lastUsedExternalAppId);
  const {
    setSelectedRepoId,
    setSelectedWorkspaceId,
    reorderWorkspace,
    closeWorkspace,
    deleteProject,
    openEntryInExternalApp,
    setLastUsedExternalAppId,
  } = useCommands();
  const workspaceUnreadToneByWorkspaceId = chatStore((state) => state.workspaceUnreadToneByWorkspaceId);
  const markWorkspaceNotificationsRead = chatStore((state) => state.markWorkspaceNotificationsRead);
  const {
    menu: projectContextMenu,
    openMenu: openProjectContextMenu,
    closeMenu: closeProjectContextMenu,
    isOpen: isProjectContextMenuOpen,
  } = useContextMenuState<{
    repoId: string;
    mouseX: number;
    mouseY: number;
  }>();
  const {
    menu: workspaceContextMenu,
    openMenu: openWorkspaceContextMenu,
    closeMenu: closeWorkspaceContextMenu,
    isOpen: isWorkspaceContextMenuOpen,
  } = useContextMenuState<{
    repoId: string;
    workspaceId: string;
    mouseX: number;
    mouseY: number;
  }>();
  const {
    isCreateWorkspaceOpen,
    createWorkspaceProjectId,
    renameWorkspaceContext,
    isProjectConfigOpen,
    projectConfigProjectId,
    setIsCreateWorkspaceOpen,
    setCreateWorkspaceProjectId,
    setRenameWorkspaceContext,
    setIsProjectConfigOpen,
    setProjectConfigProjectId,
    handleOpenCreateWorkspace,
    handleOpenProjectConfig,
  } = useProjectListDialogState();
  const {
    pendingWorkspaceDeletion,
    isDeletingWorkspace,
    setPendingWorkspaceDeletion,
    handleRequestWorkspaceDeletion,
    handleCancelWorkspaceDeletion,
    handleConfirmWorkspaceDeletion,
  } = useWorkspaceDeletionFlow({
    workspaces,
    closeWorkspace,
  });
  const {
    pendingProjectDeletion,
    isDeletingProject,
    handleRequestProjectDeletion,
    handleCancelProjectDeletion,
    handleConfirmProjectDeletion,
  } = useProjectDeletionFlow({
    projects,
    deleteProject,
  });
  const [projectActionsAnchorEl, setProjectActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [projectActionsProjectId, setProjectActionsProjectId] = useState("");

  const {
    projectOrderIds,
    nodeOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    setProjectOrderIds,
    setNodeOrderByParentId,
    setFoldedProjectIds,
    setFoldedNodeKeys,
    toggleProjectFold,
    workspaceListHierarchyMode,
  } = useProjectListFoldState();

  const {
    filteredProjects,
    treeProjects,
    treeNodes,
    treeWorkspaces,
    expandedTreeItems,
    displayWorkspaceIdByProjectId,
    workspaceByProjectId,
  } = useProjectListTreeData({
    projectOrderIds,
    nodeOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    workspaceListHierarchyMode,
  });

  const [isAppFocused, setIsAppFocused] = useState(() => document.hasFocus());
  const rendererPlatform = getRendererPlatform();
  const canOpenWorkspaceInExternalApp = isExternalAppPlatformSupported(rendererPlatform);
  const openWorkspaceInFileManagerActionLabel =
    rendererPlatform === "win32" ? t("workspace.actions.openInExplorer") : t("workspace.actions.openInFinder");
  const createWorkspaceShortcutLabel = getShortcutDisplayLabelById("create-workspace", rendererPlatform);
  const createWorkspaceTooltipLabel = createWorkspaceShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("workspace.actions.add"),
        shortcut: createWorkspaceShortcutLabel,
      })
    : t("workspace.actions.add");
  const lastUsedWorkspaceExternalAppPreset = lastUsedExternalAppId
    ? findExternalAppPreset(lastUsedExternalAppId)
    : null;
  const openWorkspaceInLastUsedExternalAppActionLabel = lastUsedWorkspaceExternalAppPreset
    ? t("workspace.actions.openInExternalAppQuick", { app: lastUsedWorkspaceExternalAppPreset.label })
    : "";

  useEffect(() => {
    const handleWindowFocus = () => {
      setIsAppFocused(true);
    };
    const handleWindowBlur = () => {
      setIsAppFocused(false);
    };

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const focusedWorkspaceId = selectedWorkspaceId.trim();
    if (!isAppFocused || !focusedWorkspaceId) {
      return;
    }

    if (!(focusedWorkspaceId in workspaceUnreadToneByWorkspaceId)) {
      return;
    }

    markWorkspaceNotificationsRead(focusedWorkspaceId);
  }, [isAppFocused, markWorkspaceNotificationsRead, selectedWorkspaceId, workspaceUnreadToneByWorkspaceId]);
  /** Closes workspace context menu and nested submenu layers together. */
  const closeWorkspaceMenus = () => {
    closeWorkspaceContextMenu();
  };

  /** Closes all left-pane context menus and nested submenus together. */
  const closeAllContextMenus = () => {
    closeProjectContextMenu();
    closeWorkspaceMenus();
    setProjectActionsAnchorEl(null);
    setProjectActionsProjectId("");
  };

  const workspaceContextTarget =
    workspaceContextMenu &&
    workspaces.find(
      (workspace) => workspace.repoId === workspaceContextMenu.repoId && workspace.id === workspaceContextMenu.workspaceId,
    );
  const isWorkspaceContextTargetLocal = Boolean(
    workspaceContextTarget &&
      (workspaceContextTarget.kind === "local" ||
        displayWorkspaceIdByProjectId[workspaceContextTarget.repoId] === workspaceContextTarget.id),
  );

  const {
    workspaceInfoAnchorEl,
    hoveredWorkspace,
    hoveredWorkspaceCurrentBranch,
    hoveredWorkspacePullRequest,
    hoveredWorkspaceLatestPullRequest,
    isHoveredWorkspacePrimary,
    isWorkspaceInfoOpen,
    handleWorkspaceInfoMouseEnter,
    handleWorkspaceInfoMouseLeave,
    handleWorkspaceInfoPopoverMouseEnter,
    handleWorkspaceInfoPopoverMouseLeave,
  } = useWorkspaceInfoHover({
    workspaces,
    displayWorkspaceIdByProjectId,
  });

  useEffect(() => {
      const handleOpenCreateWorkspaceDialog = (event: Event) => {
        const customEvent = event as CustomEvent<{ repoId?: string }>;
        const requestedProjectId = customEvent.detail?.repoId?.trim();
        if (!requestedProjectId) {
          return;
        }

        handleOpenCreateWorkspace(requestedProjectId);
      };

    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleOpenCreateWorkspaceDialog as EventListener);
    return () => {
      window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleOpenCreateWorkspaceDialog as EventListener);
    };
  }, [handleOpenCreateWorkspace]);


  useSuppressNativeContextMenuWhileOpen(isProjectContextMenuOpen || isWorkspaceContextMenuOpen);

  /** Opens one workspace root path in a selected external app preset. */
  const handleOpenWorkspaceInExternalApp = async (appId: ExternalAppId) => {
    const targetWorkspaceId = workspaceContextMenu?.workspaceId;
    if (!targetWorkspaceId) {
      return;
    }

    const targetWorkspace = workspaces.find((workspace) => workspace.id === targetWorkspaceId);
    const targetWorktreePath = targetWorkspace?.worktreePath?.trim();
    if (!targetWorktreePath) {
      closeWorkspaceMenus();
      return;
    }

    try {
      await openEntryInExternalApp({
        workspaceWorktreePath: targetWorktreePath,
        appId,
      });
      setLastUsedExternalAppId(appId);
    } catch (error) {
      console.error("Failed to open workspace root in external app", error);
    } finally {
      closeWorkspaceMenus();
    }
  };

  /** Opens one workspace root path in the host OS file manager. */
  const handleOpenWorkspaceInFileManager = async () => {
    const targetWorkspaceId = workspaceContextMenu?.workspaceId;
    if (!targetWorkspaceId) {
      return;
    }

    const targetWorkspace = workspaces.find((workspace) => workspace.id === targetWorkspaceId);
    const targetWorktreePath = targetWorkspace?.worktreePath?.trim();
    if (!targetWorktreePath) {
      closeWorkspaceMenus();
      return;
    }

    try {
      await openEntryInExternalApp({
        workspaceWorktreePath: targetWorktreePath,
        appId: SYSTEM_FILE_MANAGER_APP_ID,
      });
    } catch (error) {
      console.error("Failed to open workspace root in file manager", error);
    } finally {
      closeWorkspaceMenus();
    }
  };

  const projectContextMenuAnchorPosition = useMemo(
    () =>
      projectContextMenu
        ? {
            top: projectContextMenu.mouseY,
            left: projectContextMenu.mouseX,
          }
        : undefined,
    [projectContextMenu],
  );
  const workspaceContextMenuAnchorPosition = useMemo(
    () =>
      workspaceContextMenu
        ? {
            top: workspaceContextMenu.mouseY,
            left: workspaceContextMenu.mouseX,
          }
        : undefined,
    [workspaceContextMenu],
  );
  const treeHandlers = useProjectListTreeHandlers({
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
  });

  return (
    <>
      <Box data-testid="repo-workspace-list" sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <WorkspaceTree
          projects={treeProjects}
          nodes={treeNodes}
          workspaces={treeWorkspaces}
          selectedProjectId={selectedProjectId}
          selectedWorkspaceId={selectedWorkspaceId}
          hierarchyMode={workspaceListHierarchyMode}
          expandedItems={expandedTreeItems}
          onExpandedItemsChange={treeHandlers.onExpandedItemsChange}
          deleteWorkspaceLabel={t("workspace.actions.delete")}
          createWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
          onSelectProject={treeHandlers.onSelectProject}
          onSelectWorkspace={treeHandlers.onSelectWorkspace}
          onProjectContextMenu={treeHandlers.onProjectContextMenu}
          onProjectActionsClick={treeHandlers.onProjectActionsClick}
          onProjectCreateWorkspaceClick={treeHandlers.onProjectCreateWorkspaceClick}
          onWorkspaceContextMenu={treeHandlers.onWorkspaceContextMenu}
          onWorkspaceMouseEnter={treeHandlers.onWorkspaceMouseEnter}
          onWorkspaceMouseLeave={treeHandlers.onWorkspaceMouseLeave}
          onWorkspaceRequestDelete={treeHandlers.onWorkspaceRequestDelete}
          onRowReorder={treeHandlers.onRowReorder}
        />
      </Box>
      <ProjectListMenus
        t={t}
        projectContextMenu={projectContextMenu}
        workspaceContextMenu={workspaceContextMenu}
        workspaces={workspaces}
        displayWorkspaceIdByProjectId={displayWorkspaceIdByProjectId}
        canOpenWorkspaceInExternalApp={canOpenWorkspaceInExternalApp}
        lastUsedWorkspaceExternalAppPreset={lastUsedWorkspaceExternalAppPreset}
        openWorkspaceInLastUsedExternalAppActionLabel={openWorkspaceInLastUsedExternalAppActionLabel}
        openWorkspaceInFileManagerActionLabel={openWorkspaceInFileManagerActionLabel}
        closeAllContextMenus={closeAllContextMenus}
        closeWorkspaceMenus={closeWorkspaceMenus}
        closeProjectContextMenu={closeProjectContextMenu}
        handleOpenProjectConfig={handleOpenProjectConfig}
        handleRequestProjectDeletion={handleRequestProjectDeletion}
        handleRequestWorkspaceDeletion={handleRequestWorkspaceDeletion}
        handleOpenWorkspaceInExternalApp={handleOpenWorkspaceInExternalApp}
        handleOpenWorkspaceInFileManager={handleOpenWorkspaceInFileManager}
        setRenameWorkspaceContext={setRenameWorkspaceContext}
        projectActionsAnchorEl={projectActionsAnchorEl}
        setProjectActionsAnchorEl={setProjectActionsAnchorEl}
        projectActionsProjectId={projectActionsProjectId}
        setProjectActionsProjectId={setProjectActionsProjectId}
        projectContextMenuAnchorPosition={projectContextMenuAnchorPosition}
        workspaceContextMenuAnchorPosition={workspaceContextMenuAnchorPosition}
        isCreateWorkspaceOpen={isCreateWorkspaceOpen}
        createWorkspaceProjectId={createWorkspaceProjectId}
        setIsCreateWorkspaceOpen={setIsCreateWorkspaceOpen}
        setCreateWorkspaceProjectId={setCreateWorkspaceProjectId}
        renameWorkspaceContext={renameWorkspaceContext}
        isProjectConfigOpen={isProjectConfigOpen}
        projectConfigProjectId={projectConfigProjectId}
        setIsProjectConfigOpen={setIsProjectConfigOpen}
        setProjectConfigProjectId={setProjectConfigProjectId}
        pendingWorkspaceDeletion={pendingWorkspaceDeletion}
        isDeletingWorkspace={isDeletingWorkspace}
        handleCancelWorkspaceDeletion={handleCancelWorkspaceDeletion}
        handleConfirmWorkspaceDeletion={handleConfirmWorkspaceDeletion}
        setPendingWorkspaceDeletion={setPendingWorkspaceDeletion}
        pendingProjectDeletion={pendingProjectDeletion}
        isDeletingProject={isDeletingProject}
        handleCancelProjectDeletion={handleCancelProjectDeletion}
        handleConfirmProjectDeletion={handleConfirmProjectDeletion}
        isWorkspaceInfoOpen={isWorkspaceInfoOpen}
        workspaceInfoAnchorEl={workspaceInfoAnchorEl}
        hoveredWorkspace={hoveredWorkspace}
        isHoveredWorkspacePrimary={isHoveredWorkspacePrimary}
        hoveredWorkspaceCurrentBranch={hoveredWorkspaceCurrentBranch}
        hoveredWorkspacePullRequest={hoveredWorkspacePullRequest}
        hoveredWorkspaceLatestPullRequest={hoveredWorkspaceLatestPullRequest}
        handleWorkspaceInfoPopoverMouseEnter={handleWorkspaceInfoPopoverMouseEnter}
        handleWorkspaceInfoPopoverMouseLeave={handleWorkspaceInfoPopoverMouseLeave}
      />
    </>
  );
}
