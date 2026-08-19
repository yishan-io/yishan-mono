import { Box } from "@mui/material";
import {
  markWorkspaceNotificationsRead as applyMarkWorkspaceNotificationsRead,
  useWorkspaceUnreadToneByWorkspaceId,
} from "@renderer/domains/agent";
import { openEntryInExternalApp } from "@renderer/domains/files";
import { useDetectedExternalAppIds } from "@renderer/domains/files";
import { deleteProject, projectStore, useProjectDeletionFlow } from "@renderer/domains/project";

import { activateProject, activateWorkspace } from "@renderer/domains/workbench";
import { useSelectedProjectId, useSelectedWorkspaceId, useWorkspaces } from "@renderer/domains/workspace";
import { WorkspaceDeleteDialogView } from "@renderer/domains/workspace";
import { WorkspaceInfoPopperView } from "@renderer/domains/workspace";
import { useWorkspaceDeletionFlow } from "@renderer/domains/workspace";
import { useWorkspaceInfoHover } from "@renderer/domains/workspace";
import { closeWorkspace, deleteLocalFolder, reorderWorkspace } from "@renderer/domains/workspace";
import { subscribeOpenCreateWorkspaceDialog } from "@renderer/domains/workspace";
import { useContextMenuState } from "@renderer/hooks/useContextMenuState";
import { useSuppressNativeContextMenuWhileOpen } from "@renderer/hooks/useSuppressNativeContextMenuWhileOpen";
import { getRendererPlatform } from "@renderer/platform/platform";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuSettings, LuTrash2 } from "react-icons/lu";
import {
  type ExternalAppId,
  SYSTEM_FILE_MANAGER_APP_ID,
  findExternalAppPreset,
  getExternalAppMenuEntries,
  isExternalAppPlatformSupported,
  isExternalAppPresetReliablyDetectableOnPlatform,
  isExternalAppPresetSupportedOnPlatform,
} from "../../../../shared/contracts/externalApps";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { ContextMenu, type ContextMenuEntry } from "../../../ui/components/ContextMenu";
import { ProjectListMenus } from "./ProjectListMenus";
import { useWorkspaceNavigatorDialogState } from "./useWorkspaceNavigatorDialogState";
import { useWorkspaceNavigatorFoldState } from "./useWorkspaceNavigatorFoldState";
import { useWorkspaceNavigatorTreeData } from "./useWorkspaceNavigatorTreeData";
import { useWorkspaceNavigatorTreeHandlers } from "./useWorkspaceNavigatorTreeHandlers";
import { WorkspaceTree } from "./workspace-tree";
import type { WorkspaceTreeWorkspace } from "./workspace-tree";
import type { WorkspaceTreeRow } from "./workspace-tree/types";
import { parseNodeRowNodeId, parseProjectRowProjectId, reconcileOrder, reorderIds } from "./workspaceNavigatorHelpers";

/**
 * Cross-Domain workspace navigator: renders project rows and nested workspace
 * rows with per-project fold controls, composed from Domain public APIs.
 *
 * Owned by the App (desktop7 Phase 24); Project keeps its list rules and
 * state, Workspace keeps workspace lifecycle and presentation.
 */
export function WorkspaceNavigatorView() {
  const { t } = useTranslation();
  const projects = projectStore((state) => state.projects);
  const workspaces = useWorkspaces() ?? [];
  const selectedProjectId = useSelectedProjectId();
  const selectedWorkspaceId = useSelectedWorkspaceId();
  const lastUsedExternalAppId = projectStore((state) => state.lastUsedExternalAppId);
  const workspaceUnreadToneByWorkspaceId = useWorkspaceUnreadToneByWorkspaceId();
  const markWorkspaceNotificationsRead = applyMarkWorkspaceNotificationsRead;
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
  } = useWorkspaceNavigatorDialogState();
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
    workspaceOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    setProjectOrderIds,
    setNodeOrderByParentId,
    setWorkspaceOrderByParentId,
    setFoldedProjectIds,
    setFoldedNodeKeys,
    toggleProjectFold,
    workspaceListHierarchyMode,
  } = useWorkspaceNavigatorFoldState();

  const {
    filteredProjects,
    treeProjects,
    treeNodes,
    treeWorkspaces,
    expandedTreeItems,
    displayWorkspaceIdByProjectId,
    workspaceByProjectId,
  } = useWorkspaceNavigatorTreeData({
    projectOrderIds,
    nodeOrderByParentId,
    workspaceOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    workspaceListHierarchyMode,
  });

  const [isAppFocused, setIsAppFocused] = useState(() => document.hasFocus());
  const rendererPlatform = getRendererPlatform();
  const canOpenWorkspaceInExternalApp = isExternalAppPlatformSupported(rendererPlatform);
  const detectedExternalAppIds = useDetectedExternalAppIds();
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
  const externalAppMenuEntries = useMemo(
    () =>
      detectedExternalAppIds === undefined ? [] : getExternalAppMenuEntries(rendererPlatform, detectedExternalAppIds),
    [detectedExternalAppIds, rendererPlatform],
  );
  const filteredLastUsedWorkspaceExternalAppPreset = useMemo(() => {
    if (!lastUsedWorkspaceExternalAppPreset) {
      return null;
    }

    if (!isExternalAppPresetSupportedOnPlatform(lastUsedWorkspaceExternalAppPreset.id, rendererPlatform)) {
      return null;
    }

    if (detectedExternalAppIds === undefined) {
      return null;
    }

    if (detectedExternalAppIds === null) {
      return lastUsedWorkspaceExternalAppPreset;
    }

    return detectedExternalAppIds.includes(lastUsedWorkspaceExternalAppPreset.id) ||
      !isExternalAppPresetReliablyDetectableOnPlatform(lastUsedWorkspaceExternalAppPreset.id, rendererPlatform)
      ? lastUsedWorkspaceExternalAppPreset
      : null;
  }, [detectedExternalAppIds, lastUsedWorkspaceExternalAppPreset, rendererPlatform]);
  const openWorkspaceInLastUsedExternalAppActionLabel = filteredLastUsedWorkspaceExternalAppPreset
    ? t("workspace.actions.openInExternalAppQuick", { app: filteredLastUsedWorkspaceExternalAppPreset.label })
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
    return subscribeOpenCreateWorkspaceDialog(({ projectId }) => {
      handleOpenCreateWorkspace(projectId);
    });
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
      projectStore.getState().setLastUsedExternalAppId(appId);
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

  /** Deletes one local folder workspace via its id, then closes its context menu. */
  const handleDeleteLocalFolder = (folderId: string) => {
    closeWorkspaceMenus();
    void deleteLocalFolder(folderId);
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
  const treeHandlers = useWorkspaceNavigatorTreeHandlers({
    workspaceListHierarchyMode,
    treeWorkspaces,
    filteredProjects,
    projectOrderIds,
    nodeOrderByParentId,
    workspaceOrderByParentId,
    foldedProjectIds,
    setFoldedProjectIds,
    setFoldedNodeKeys,
    setProjectOrderIds,
    setNodeOrderByParentId,
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
  });

  return (
    <>
      <Box data-testid="repo-workspace-list" sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
          localFolderGroupLabel={t("project.list.localFolders")}
        />
      </Box>
      <ProjectListMenus
        t={t}
        projectContextMenu={projectContextMenu}
        workspaceContextMenu={workspaceContextMenu}
        workspaces={workspaces}
        displayWorkspaceIdByProjectId={displayWorkspaceIdByProjectId}
        canOpenWorkspaceInExternalApp={canOpenWorkspaceInExternalApp}
        externalAppMenuEntries={externalAppMenuEntries}
        lastUsedWorkspaceExternalAppPreset={filteredLastUsedWorkspaceExternalAppPreset}
        openWorkspaceInLastUsedExternalAppActionLabel={openWorkspaceInLastUsedExternalAppActionLabel}
        openWorkspaceInFileManagerActionLabel={openWorkspaceInFileManagerActionLabel}
        closeAllContextMenus={closeAllContextMenus}
        closeWorkspaceMenus={closeWorkspaceMenus}
        closeProjectContextMenu={closeProjectContextMenu}
        handleOpenProjectConfig={handleOpenProjectConfig}
        handleRequestProjectDeletion={handleRequestProjectDeletion}
        handleRequestWorkspaceDeletion={handleRequestWorkspaceDeletion}
        handleDeleteLocalFolder={handleDeleteLocalFolder}
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
