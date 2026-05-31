import { useQuery } from "@tanstack/react-query";
import { Box, ListItemIcon, Menu, MenuItem } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { sessionStore } from "../../../store/sessionStore";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { api } from "../../../api/client";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";
import { ProjectDeleteDialogView } from "./ProjectDeleteDialogView";
import { WorkspaceDeleteDialogView } from "./WorkspaceDeleteDialogView";
import { WorkspaceInfoPopperView } from "./WorkspaceInfoPopperView";
import { useProjectDeletionFlow } from "./useProjectDeletionFlow";
import { useProjectListDialogState } from "./useProjectListDialogState";
import { useWorkspaceDeletionFlow } from "./useWorkspaceDeletionFlow";
import { useWorkspaceInfoHover } from "./useWorkspaceInfoHover";

function resolveWorkspaceNotificationTone(input: {
  runtimeStatus: "running" | "waiting_input" | "idle";
  unreadTone?: "success" | "error";
}): "none" | "waiting_input" | "done" | "failed" {
  if (input.runtimeStatus === "waiting_input") {
    return "waiting_input";
  }

  if (input.unreadTone === "error") {
    return "failed";
  }

  if (input.unreadTone === "success") {
    return "done";
  }

  return "none";
}

function reorderIds(input: {
  ids: string[];
  draggedId: string;
  targetId: string;
  position: "before" | "after";
}): string[] {
  const draggedIndex = input.ids.indexOf(input.draggedId);
  const targetIndex = input.ids.indexOf(input.targetId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return input.ids;
  }

  const nextIds = [...input.ids];
  const [movedId] = nextIds.splice(draggedIndex, 1);
  if (!movedId) {
    return input.ids;
  }

  const nextTargetIndex = nextIds.indexOf(input.targetId);
  if (nextTargetIndex < 0) {
    return input.ids;
  }

  const insertIndex = input.position === "after" ? nextTargetIndex + 1 : nextTargetIndex;
  nextIds.splice(insertIndex, 0, movedId);
  return nextIds;
}

/**
 * Merge a stored order list with the current live set of IDs.
 * - IDs no longer in liveIds are stripped (unchecked / removed items).
 * - IDs in liveIds but absent from storedOrder are appended at the end
 *   (newly added / re-checked items).
 * The relative order of retained IDs is preserved from storedOrder.
 */
function reconcileOrder(storedOrder: string[], liveIds: string[]): string[] {
  const liveSet = new Set(liveIds);
  const retained = storedOrder.filter((id) => liveSet.has(id));
  const retainedSet = new Set(retained);
  const appended = liveIds.filter((id) => !retainedSet.has(id));
  return [...retained, ...appended];
}

function parseProjectRowProjectId(rowId: string): string {
  const value = rowId.replace(/^project:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex < 0) {
    return value;
  }
  return value.slice(splitIndex + 1);
}

function parseNodeRowNodeId(rowId: string): string {
  const value = rowId.replace(/^node:/, "");
  const splitIndex = value.indexOf(":");
  if (splitIndex < 0) {
    return value;
  }
  return value.slice(splitIndex + 1);
}

/** Renders project rows and nested workspace rows with per-project fold controls. */
export function ProjectListView() {
  const { t } = useTranslation();
  const projects = workspaceStore((state) => state.projects) ?? [];
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const displayProjectIds = workspaceStore((state) => state.displayProjectIds) ?? [];
  const gitChangeTotalsByWorkspaceId = workspaceStore((state) => state.gitChangeTotalsByWorkspaceId);
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
  const workspaceAgentStatusByWorkspaceId = chatStore((state) => state.workspaceAgentStatusByWorkspaceId);
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
  const [foldStateByMode, setFoldStateByMode] = useState<
    Record<"by_project" | "by_node", { foldedProjectIds: string[]; foldedNodeKeys: string[] }>
  >({
    by_project: { foldedProjectIds: [], foldedNodeKeys: [] },
    by_node: { foldedProjectIds: [], foldedNodeKeys: [] },
  });
  const [projectActionsAnchorEl, setProjectActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [projectActionsProjectId, setProjectActionsProjectId] = useState("");

  // Order and fold state is stored per hierarchy mode so that switching
  // between by_project and by_node gives a fully isolated, clean state for
  // each mode without any cross-mode bleed.
  const [orderStateByMode, setOrderStateByMode] = useState<
    Record<"by_project" | "by_node", { projectOrderIds: string[]; nodeOrderByParentId: Record<string, string[]> }>
  >({
    by_project: { projectOrderIds: [], nodeOrderByParentId: {} },
    by_node: { projectOrderIds: [], nodeOrderByParentId: {} },
  });

  // Keep projectOrderIds in sync with the filter: remove any ID that is no
  // longer in displayProjectIds so that re-checked projects are appended to
  // the end of the list (treated as new) rather than snapping back to their
  // old position. Applied only to the by_project mode bucket since
  // displayProjectIds does not affect by_node project order (controlled by
  // per-node drag order instead).
  useEffect(() => {
    setOrderStateByMode((current) => {
      const prev = current.by_project.projectOrderIds;
      const next = prev.filter((id) => displayProjectIds.includes(id));
      if (next.length === prev.length) {
        return current;
      }

      return {
        ...current,
        by_project: { ...current.by_project, projectOrderIds: next },
      };
    });
  }, [displayProjectIds]);

  const [isAppFocused, setIsAppFocused] = useState(() => document.hasFocus());
  const workspaceListHierarchyMode = workspaceUiStore((state) => state.workspaceListHierarchyMode);

  // Derive mode-specific order helpers with stable setter signatures so the
  // rest of the component does not need to know about the per-mode nesting.
  const projectOrderIds = orderStateByMode[workspaceListHierarchyMode].projectOrderIds;
  const nodeOrderByParentId = orderStateByMode[workspaceListHierarchyMode].nodeOrderByParentId;

  const setProjectOrderIds = (next: string[]) => {
    setOrderStateByMode((current) => ({
      ...current,
      [workspaceListHierarchyMode]: { ...current[workspaceListHierarchyMode], projectOrderIds: next },
    }));
  };

  const setNodeOrderByParentId = (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setOrderStateByMode((current) => ({
      ...current,
      [workspaceListHierarchyMode]: {
        ...current[workspaceListHierarchyMode],
        nodeOrderByParentId: updater(current[workspaceListHierarchyMode].nodeOrderByParentId),
      },
    }));
  };

  const foldedProjectIds = foldStateByMode[workspaceListHierarchyMode].foldedProjectIds;
  const foldedNodeKeys = foldStateByMode[workspaceListHierarchyMode].foldedNodeKeys;

  const setFoldedProjectIds = (updater: string[] | ((prev: string[]) => string[])) => {
    setFoldStateByMode((current) => ({
      ...current,
      [workspaceListHierarchyMode]: {
        ...current[workspaceListHierarchyMode],
        foldedProjectIds:
          typeof updater === "function"
            ? updater(current[workspaceListHierarchyMode].foldedProjectIds)
            : updater,
      },
    }));
  };

  const setFoldedNodeKeys = (updater: string[] | ((prev: string[]) => string[])) => {
    setFoldStateByMode((current) => ({
      ...current,
      [workspaceListHierarchyMode]: {
        ...current[workspaceListHierarchyMode],
        foldedNodeKeys:
          typeof updater === "function"
            ? updater(current[workspaceListHierarchyMode].foldedNodeKeys)
            : updater,
      },
    }));
  };
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const nodesQuery = useQuery({
    queryKey: ["org-nodes", selectedOrganizationId],
    queryFn: () => api.node.listByOrg(selectedOrganizationId as string),
    enabled: Boolean(selectedOrganizationId),
  });
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

  const workspaceByProjectId = workspaces.reduce<Record<string, (typeof workspaces)[number][]>>((acc, workspace) => {
    const existing = acc[workspace.repoId];
    if (existing) {
      existing.push(workspace);
    } else {
      acc[workspace.repoId] = [workspace];
    }
    return acc;
  }, {});
  const filteredProjects = useMemo(() => {
    const projectById = new Map(projects.filter((project) => displayProjectIds.includes(project.id)).map((project) => [project.id, project]));
    const orderedIds = projectOrderIds.filter((projectId) => projectById.has(projectId));
    const missingIds = Array.from(projectById.keys()).filter((projectId) => !orderedIds.includes(projectId));
    const nextIds = [...orderedIds, ...missingIds];
    return nextIds.map((projectId) => projectById.get(projectId)).filter((project): project is NonNullable<typeof project> => Boolean(project));
  }, [displayProjectIds, projectOrderIds, projects]);
  const treeProjects = filteredProjects.map((project) => ({
    id: project.id,
    name: project.name,
    icon: project.icon,
    color: project.color,
  }));
  const treeNodes = (nodesQuery.data ?? []).map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    scope: node.scope,
    isOnline: node.isOnline,
  }));
  const treeWorkspaces: WorkspaceTreeWorkspace[] = useMemo(() => {
    const rows: WorkspaceTreeWorkspace[] = [];
    for (const project of filteredProjects) {
      const projectWorkspaces = workspaceByProjectId[project.id] ?? [];
      const preferredProjectPath = project.localPath?.trim() || project.path?.trim() || project.worktreePath?.trim() || "";
      const localDisplayWorkspaceId = preferredProjectPath
        ? (projectWorkspaces.find(
            (workspace) => workspace.kind !== "local" && workspace.worktreePath?.trim() === preferredProjectPath,
          )?.id ?? "")
        : "";
      const displayedWorkspaces = localDisplayWorkspaceId
        ? projectWorkspaces.filter((workspace) => workspace.kind !== "local")
        : projectWorkspaces;

      const parentNodeOrder = nodeOrderByParentId[`project:${project.id}`] ?? [];
      const nodeRankById = new Map(parentNodeOrder.map((nodeId, index) => [nodeId, index]));
      const sortedWorkspaces = [...displayedWorkspaces].sort((a, b) => {
        const nodeA = a.nodeId?.trim() || "unknown";
        const nodeB = b.nodeId?.trim() || "unknown";
        const rankA = nodeRankById.get(nodeA) ?? Number.MAX_SAFE_INTEGER;
        const rankB = nodeRankById.get(nodeB) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return 0;
      });

      for (const workspace of sortedWorkspaces) {
        rows.push({
          id: workspace.id,
          name: workspace.kind === "local" || localDisplayWorkspaceId === workspace.id ? "local" : workspace.title,
          projectId: project.id,
          nodeId: workspace.nodeId?.trim() || "unknown",
          kind: workspace.kind === "local" || localDisplayWorkspaceId === workspace.id ? "local" : "managed",
          additions: gitChangeTotalsByWorkspaceId[workspace.id]?.additions ?? 0,
          deletions: gitChangeTotalsByWorkspaceId[workspace.id]?.deletions ?? 0,
          runtimeStatus: workspaceAgentStatusByWorkspaceId[workspace.id] ?? "idle",
          notificationTone: resolveWorkspaceNotificationTone({
            runtimeStatus: workspaceAgentStatusByWorkspaceId[workspace.id] ?? "idle",
            unreadTone: workspaceUnreadToneByWorkspaceId[workspace.id],
          }),
        });
      }
    }
    if (workspaceListHierarchyMode !== "by_node") {
      return rows;
    }

    const topNodeOrder = nodeOrderByParentId["root:node"] ?? [];
    const topNodeRankById = new Map(topNodeOrder.map((nodeId, index) => [nodeId, index]));
    return [...rows].sort((a, b) => {
      const rankNodeA = topNodeRankById.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER;
      const rankNodeB = topNodeRankById.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER;
      if (rankNodeA !== rankNodeB) {
        return rankNodeA - rankNodeB;
      }

      const projectOrder = nodeOrderByParentId[`node:${a.nodeId}`] ?? [];
      const projectRankById = new Map(projectOrder.map((projectId, index) => [projectId, index]));
      const rankProjectA = projectRankById.get(a.projectId) ?? Number.MAX_SAFE_INTEGER;
      const rankProjectB = projectRankById.get(b.projectId) ?? Number.MAX_SAFE_INTEGER;
      if (rankProjectA !== rankProjectB) {
        return rankProjectA - rankProjectB;
      }

      return 0;
    });
  }, [
    filteredProjects,
    gitChangeTotalsByWorkspaceId,
    nodeOrderByParentId,
    workspaceListHierarchyMode,
    workspaceAgentStatusByWorkspaceId,
    workspaceByProjectId,
    workspaceUnreadToneByWorkspaceId,
  ]);
  const expandedTreeItems = useMemo(() => {
    const items: string[] = [];
    const foldedTopSet = new Set(foldedProjectIds);
    const foldedChildSet = new Set(foldedNodeKeys);

    if (workspaceListHierarchyMode === "by_node") {
      const nodeIds = Array.from(new Set(treeWorkspaces.map((workspace) => workspace.nodeId)));
      for (const nodeId of nodeIds) {
        if (foldedTopSet.has(nodeId)) {
          continue;
        }

        items.push(`node:${nodeId}`);
        const projectIds = Array.from(
          new Set(
            treeWorkspaces
              .filter((workspace) => workspace.nodeId === nodeId)
              .map((workspace) => workspace.projectId),
          ),
        );
        for (const projectId of projectIds) {
          const projectKey = `${nodeId}:${projectId}`;
          if (!foldedChildSet.has(projectKey)) {
            items.push(`project:${projectKey}`);
          }
        }
      }
      return items;
    }

    for (const project of filteredProjects) {
      if (foldedTopSet.has(project.id)) {
        continue;
      }

      items.push(`project:${project.id}`);
      const projectNodeIds = new Set(treeWorkspaces.filter((workspace) => workspace.projectId === project.id).map((w) => w.nodeId));
      for (const nodeId of projectNodeIds) {
        const nodeKey = `${project.id}:${nodeId}`;
        if (!foldedChildSet.has(nodeKey)) {
          items.push(`node:${nodeKey}`);
        }
      }
    }
    return items;
  }, [filteredProjects, foldedNodeKeys, foldedProjectIds, treeWorkspaces, workspaceListHierarchyMode]);
  const displayWorkspaceIdByProjectId = useMemo(() => {
    const displayWorkspaceIdByProjectIdMap: Record<string, string> = {};

    for (const project of projects) {
      const projectWorkspaces = workspaceByProjectId[project.id] ?? [];
      const preferredProjectPath = project.localPath?.trim() || project.path?.trim() || project.worktreePath?.trim() || "";
      if (!preferredProjectPath) {
        continue;
      }

      const primaryWorkspace = projectWorkspaces.find(
        (workspace) => workspace.kind !== "local" && workspace.worktreePath?.trim() === preferredProjectPath,
      );
      if (primaryWorkspace) {
        displayWorkspaceIdByProjectIdMap[project.id] = primaryWorkspace.id;
      }
    }

    return displayWorkspaceIdByProjectIdMap;
  }, [projects, workspaceByProjectId]);
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


  /** Toggles whether one repository row is folded in the list UI. */
  const toggleProjectFold = (projectId: string) => {
    setFoldedProjectIds((current) =>
      current.includes(projectId) ? current.filter((item) => item !== projectId) : [...current, projectId],
    );
  };

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

  const projectContextMenuItems: ContextMenuEntry[] = [
    {
      id: "repo-config",
      label: t("project.actions.config"),
      icon: <LuSettings size={14} />,
      onSelect: () => {
        if (!projectContextMenu) {
          return;
        }

        handleOpenProjectConfig(projectContextMenu.repoId);
      },
    },
    {
      id: "repo-delete",
      label: t("project.actions.delete"),
      icon: <LuTrash2 size={14} />,
      onSelect: () => {
        if (!projectContextMenu) {
          return;
        }

        handleRequestProjectDeletion(projectContextMenu.repoId);
      },
    },
  ];

  const workspaceExternalAppItems: ContextMenuEntry[] = EXTERNAL_APP_MENU_ENTRIES.reduce<ContextMenuEntry[]>(
    (items, entry) => {
      if (entry.kind === "app") {
        const appPreset = findExternalAppPreset(entry.appId);
        if (!appPreset) {
          return items;
        }

        items.push({
          id: appPreset.id,
          label: appPreset.label,
          icon: <Box component="img" src={appPreset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
          onSelect: () => {
            void handleOpenWorkspaceInExternalApp(appPreset.id);
          },
        });
        return items;
      }

      const jetBrainsItems: ContextMenuEntry[] = JETBRAINS_EXTERNAL_APP_IDS.reduce<ContextMenuEntry[]>(
        (childItems, appId) => {
          const appPreset = findExternalAppPreset(appId);
          if (!appPreset) {
            return childItems;
          }

          childItems.push({
            id: appPreset.id,
            label: appPreset.label,
            icon: <Box component="img" src={appPreset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
            onSelect: () => {
              void handleOpenWorkspaceInExternalApp(appPreset.id);
            },
          });
          return childItems;
        },
        [],
      );

      items.push({
        id: `group-${entry.id}`,
        label: entry.label,
        icon: <Box component="img" src={entry.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
        items: jetBrainsItems,
      });
      return items;
    },
    [],
  );

  const workspaceContextMenuItems: ContextMenuEntry[] = [
    {
      id: "workspace-open-in-file-manager",
      label: openWorkspaceInFileManagerActionLabel,
      onSelect: () => {
        void handleOpenWorkspaceInFileManager();
      },
    },
    ...(canOpenWorkspaceInExternalApp && lastUsedWorkspaceExternalAppPreset
      ? [
          {
            id: "workspace-open-last-used-external-app",
            label: openWorkspaceInLastUsedExternalAppActionLabel,
            endAdornment: (
              <Box
                component="img"
                src={lastUsedWorkspaceExternalAppPreset.iconSrc}
                alt=""
                sx={{ width: 16, height: 16, ml: 1 }}
              />
            ),
            onSelect: () => {
              void handleOpenWorkspaceInExternalApp(lastUsedWorkspaceExternalAppPreset.id);
            },
          },
        ]
      : []),
    ...(canOpenWorkspaceInExternalApp
      ? [
          {
            id: "workspace-open-external-app-submenu",
            label: t("workspace.actions.openInExternalApp"),
            items: workspaceExternalAppItems,
          },
        ]
      : []),
    ...(workspaceContextMenu && !isWorkspaceContextTargetLocal
      ? [
          {
            id: "workspace-rename",
            label: t("workspace.actions.rename"),
            onSelect: () => {
              if (!workspaceContextMenu) {
                return;
              }

              const workspace = workspaces.find((item) => item.id === workspaceContextMenu.workspaceId);
              const isWorkspaceDisplayedAsLocal =
                workspace?.kind === "local" ||
                (workspace ? displayWorkspaceIdByProjectId[workspace.repoId] === workspace.id : false);
              if (!workspace || isWorkspaceDisplayedAsLocal) {
                return;
              }

              closeWorkspaceMenus();
              setRenameWorkspaceContext({
                projectId: workspace.repoId,
                workspaceId: workspace.id,
              });
            },
          },
          {
            id: "workspace-delete",
            label: t("workspace.actions.delete"),
            onSelect: () => {
              if (!workspaceContextMenu) {
                return;
              }

              handleRequestWorkspaceDeletion(workspaceContextMenu.repoId, workspaceContextMenu.workspaceId);
            },
          },
        ]
      : []),
  ];
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
          onExpandedItemsChange={(items) => {
            if (workspaceListHierarchyMode === "by_node") {
              const expandedNodeIds = new Set(
                items
                  .filter((item) => item.startsWith("node:"))
                  .map((item) => item.replace(/^node:/, "")),
              );
              const expandedProjectKeys = new Set(
                items
                  .filter((item) => item.startsWith("project:"))
                  .map((item) => item.replace(/^project:/, "")),
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
                  // Only mark as folded if the parent node was already expanded before
                  // this change. If the node was just re-expanded (was in foldedProjectIds),
                  // absence of the project key from items means the tree hasn't rendered
                  // it yet — not that the user folded it.
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
              items
                .filter((item) => item.startsWith("project:"))
                .map((item) => item.replace(/^project:/, "")),
            );
            const expandedNodeKeys = new Set(
              items
                .filter((item) => item.startsWith("node:"))
                .map((item) => item.replace(/^node:/, "")),
            );
            const nextFoldedProjectIds = filteredProjects
              .map((project) => project.id)
              .filter((projectId) => !expandedProjectIds.has(projectId));
            const visibleNodeKeys = Array.from(new Set(treeWorkspaces.map((workspace) => `${workspace.projectId}:${workspace.nodeId}`)));
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
                  // Only mark as folded if the project was already expanded before
                  // this change. If the project was just re-expanded (was in
                  // foldedProjectIds), absence means the tree hasn't rendered the
                  // child yet — not that the user explicitly folded the node.
                  const projectWasPreviouslyFolded = foldedProjectIds.includes(projectId);
                  if (!projectWasPreviouslyFolded) {
                    next.add(nodeKey);
                  }
                }
              }
              return Array.from(next);
            });
          }}
          deleteWorkspaceLabel={t("workspace.actions.delete")}
          createWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
          onSelectProject={(projectId) => {
            setSelectedRepoId(projectId);
            if (workspaceListHierarchyMode === "by_project") {
              setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
            }
          }}
          onSelectWorkspace={(workspaceId, projectId) => {
            setSelectedRepoId(projectId);
            setSelectedWorkspaceId(workspaceId);
            setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
          }}
          onProjectContextMenu={(event, projectId) => {
            event.preventDefault();
            event.stopPropagation();
            closeWorkspaceMenus();
            setSelectedRepoId(projectId);
            openProjectContextMenu({
              repoId: projectId,
              mouseX: event.clientX,
              mouseY: event.clientY,
            });
          }}
          onProjectActionsClick={(event, projectId) => {
            closeAllContextMenus();
            setSelectedRepoId(projectId);
            setProjectActionsAnchorEl(event.currentTarget);
            setProjectActionsProjectId(projectId);
          }}
          onProjectCreateWorkspaceClick={(event, projectId) => {
            event.preventDefault();
            event.stopPropagation();
            closeAllContextMenus();
            setSelectedRepoId(projectId);
            handleOpenCreateWorkspace(projectId);
          }}
          onWorkspaceContextMenu={(event, workspaceId, projectId) => {
            event.preventDefault();
            event.stopPropagation();
            closeProjectContextMenu();
            closeWorkspaceMenus();
            setSelectedRepoId(projectId);
            setSelectedWorkspaceId(workspaceId);
            openWorkspaceContextMenu({
              repoId: projectId,
              workspaceId,
              mouseX: event.clientX,
              mouseY: event.clientY,
            });
          }}
          onWorkspaceMouseEnter={(event, workspaceId) => {
            handleWorkspaceInfoMouseEnter(workspaceId, event.currentTarget);
          }}
          onWorkspaceMouseLeave={handleWorkspaceInfoMouseLeave}
          onWorkspaceRequestDelete={(workspaceId, projectId) => {
            handleRequestWorkspaceDeletion(projectId, workspaceId);
          }}
          onRowReorder={({ draggedRowId, targetRowId, rowKind, parentId, position }) => {
            if (rowKind === "workspace") {
              const draggedId = draggedRowId.replace(/^workspace:/, "");
              const targetId = targetRowId.replace(/^workspace:/, "");
              reorderWorkspace({
                draggedWorkspaceId: draggedId,
                targetWorkspaceId: targetId,
                position,
              });
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
                const currentOrder = reconcileOrder(
                  nodeOrderByParentId[parentId] ?? [],
                  projectIdsUnderNode,
                );
                const nextOrder = reorderIds({
                  ids: currentOrder,
                  draggedId: draggedProjectId,
                  targetId: targetProjectId,
                  position,
                });
                setNodeOrderByParentId((current) => ({
                  ...current,
                  [parentId]: nextOrder,
                }));
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
                      // "root:node" is the synthetic parent for top-level nodes in by_node mode;
                      // every workspace belongs to a node, so include all.
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
              const currentOrder = reconcileOrder(
                nodeOrderByParentId[reorderParentId] ?? [],
                nodeIdsUnderParent,
              );
              const nextOrder = reorderIds({
                ids: currentOrder,
                draggedId: draggedNodeId,
                targetId: targetNodeId,
                position,
              });
              setNodeOrderByParentId((current) => ({
                ...current,
                [reorderParentId]: nextOrder,
              }));
            }
          }}
        />
      </Box>
      <Menu
        open={Boolean(projectActionsAnchorEl && projectActionsProjectId)}
        anchorEl={projectActionsAnchorEl}
        onClose={() => {
          setProjectActionsAnchorEl(null);
          setProjectActionsProjectId("");
        }}
      >
        <MenuItem
          onClick={() => {
            if (!projectActionsProjectId) {
              return;
            }

            handleOpenProjectConfig(projectActionsProjectId);
            setProjectActionsAnchorEl(null);
            setProjectActionsProjectId("");
          }}
        >
          <ListItemIcon>
            <LuSettings size={14} />
          </ListItemIcon>
          {t("project.actions.config")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!projectActionsProjectId) {
              return;
            }

            handleRequestProjectDeletion(projectActionsProjectId);
            setProjectActionsAnchorEl(null);
            setProjectActionsProjectId("");
          }}
        >
          <ListItemIcon>
            <LuTrash2 size={14} />
          </ListItemIcon>
          {t("project.actions.delete")}
        </MenuItem>
      </Menu>
      <ContextMenu
        open={Boolean(projectContextMenu)}
        onClose={closeAllContextMenus}
        anchorPosition={projectContextMenuAnchorPosition}
        items={projectContextMenuItems}
      />
      <ContextMenu
        open={Boolean(workspaceContextMenu)}
        onClose={closeWorkspaceMenus}
        anchorPosition={workspaceContextMenuAnchorPosition}
        items={workspaceContextMenuItems}
      />
      <CreateWorkspaceDialogView
        open={isCreateWorkspaceOpen}
        projectId={createWorkspaceProjectId}
        onClose={() => {
          setIsCreateWorkspaceOpen(false);
          setCreateWorkspaceProjectId("");
        }}
      />
      <CreateWorkspaceDialogView
        mode="rename"
        open={Boolean(renameWorkspaceContext)}
        projectId={renameWorkspaceContext?.projectId ?? ""}
        workspaceId={renameWorkspaceContext?.workspaceId ?? ""}
        onClose={() => {
          setRenameWorkspaceContext(null);
        }}
      />
      <ProjectConfigDialogView
        open={isProjectConfigOpen}
        repoId={projectConfigProjectId}
        onClose={() => {
          setIsProjectConfigOpen(false);
          setProjectConfigProjectId("");
        }}
      />
      <WorkspaceDeleteDialogView
        open={Boolean(pendingWorkspaceDeletion)}
        workspaceName={pendingWorkspaceDeletion?.workspaceName ?? ""}
        allowRemoveBranch={pendingWorkspaceDeletion?.allowRemoveBranch ?? true}
        isDeleting={isDeletingWorkspace}
        onCancel={handleCancelWorkspaceDeletion}
        onConfirm={() => void handleConfirmWorkspaceDeletion()}
        onAllowRemoveBranchChange={(nextValue) => {
          if (!pendingWorkspaceDeletion) {
            return;
          }

          setPendingWorkspaceDeletion({
            ...pendingWorkspaceDeletion,
            allowRemoveBranch: nextValue,
          });
        }}
      />
      <ProjectDeleteDialogView
         open={Boolean(pendingProjectDeletion)}
         repoName={pendingProjectDeletion?.projectName ?? ""}
         isDeleting={isDeletingProject}
         onCancel={handleCancelProjectDeletion}
         onConfirm={() => void handleConfirmProjectDeletion()}
       />
      <WorkspaceInfoPopperView
        open={isWorkspaceInfoOpen}
        anchorEl={workspaceInfoAnchorEl}
        workspace={hoveredWorkspace}
        isPrimaryWorkspace={isHoveredWorkspacePrimary}
        currentBranch={hoveredWorkspaceCurrentBranch}
        pullRequest={hoveredWorkspacePullRequest}
        latestPullRequest={hoveredWorkspaceLatestPullRequest}
        onMouseEnter={handleWorkspaceInfoPopoverMouseEnter}
        onMouseLeave={handleWorkspaceInfoPopoverMouseLeave}
      />
    </>
  );
}
