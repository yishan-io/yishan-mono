import { Box, List } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ProjectRow } from "../../../components/ProjectRow";
import { WorkspaceRow, type WorkspaceRowIndicator } from "../../../components/WorkspaceRow";
import { useCommands } from "../../../hooks/useCommands";
import { useContextMenuState } from "../../../hooks/useContextMenuState";
import { useSuppressNativeContextMenuWhileOpen } from "../../../hooks/useSuppressNativeContextMenuWhileOpen";
import { getRendererPlatform } from "../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { type WorkspaceUnreadTone, chatStore } from "../../../store/chatStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";
import { ProjectDeleteDialogView } from "./ProjectDeleteDialogView";
import { WorkspaceDeleteDialogView } from "./WorkspaceDeleteDialogView";
import { WorkspaceInfoPopperView } from "./WorkspaceInfoPopperView";

type PendingWorkspaceDeletion = {
  repoId: string;
  workspaceId: string;
  workspaceName: string;
  allowRemoveBranch: boolean;
};

type PendingRepoDeletion = {
  repoId: string;
  repoName: string;
};

/**
 * Resolves the final workspace indicator from runtime status and unread notification tone.
 *
 * Priority is: running > waiting_input > failed > done > none.
 */
function resolveWorkspaceIndicator(input: {
  runtimeStatus: "running" | "waiting_input" | "idle";
  unreadTone?: WorkspaceUnreadTone;
}): WorkspaceRowIndicator {
  if (input.runtimeStatus === "running") {
    return "running";
  }

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

/** Renders repository rows and nested workspace rows with per-repo fold controls. */
export function ProjectListView() {
  const workspaceInfoCloseDelayMs = 120;
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
    closeWorkspace,
    deleteProject,
    openEntryInExternalApp,
    setLastUsedExternalAppId,
  } = useCommands();
  const workspaceAgentStatusByWorkspaceId = chatStore((state) => state.workspaceAgentStatusByWorkspaceId);
  const workspaceUnreadToneByWorkspaceId = chatStore((state) => state.workspaceUnreadToneByWorkspaceId);
  const markWorkspaceNotificationsRead = chatStore((state) => state.markWorkspaceNotificationsRead);
  const {
    menu: repoContextMenu,
    openMenu: openRepoContextMenu,
    closeMenu: closeRepoContextMenu,
    isOpen: isRepoContextMenuOpen,
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
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [createWorkspaceRepoId, setCreateWorkspaceRepoId] = useState("");
  const [renameWorkspaceContext, setRenameWorkspaceContext] = useState<{
    repoId: string;
    workspaceId: string;
  } | null>(null);
  const [isRepoConfigOpen, setIsRepoConfigOpen] = useState(false);
  const [repoConfigRepoId, setRepoConfigRepoId] = useState("");
  const [pendingWorkspaceDeletion, setPendingWorkspaceDeletion] = useState<PendingWorkspaceDeletion | null>(null);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [pendingRepoDeletion, setPendingRepoDeletion] = useState<PendingRepoDeletion | null>(null);
  const deleteProjectMutation = useMutation({
    mutationFn: async (repoId: string) => {
      await deleteProject(repoId);
    },
    onSuccess: () => {
      setPendingRepoDeletion(null);
    },
    onError: (error) => {
      console.error("Failed to delete project", error);
    },
  });
  const isDeletingRepo = deleteProjectMutation.isPending;
  const [foldedRepoIds, setFoldedRepoIds] = useState<string[]>([]);
  const [workspaceInfoAnchorEl, setWorkspaceInfoAnchorEl] = useState<HTMLElement | null>(null);
  const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState("");
  const [isAppFocused, setIsAppFocused] = useState(() => document.hasFocus());
  const workspaceInfoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    closeRepoContextMenu();
    closeWorkspaceMenus();
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
  const filteredProjects = projects.filter((p) => displayProjectIds.includes(p.id));
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

  /** Opens the create workspace dialog for one selected repository id. */
  const handleOpenCreateWorkspace = useCallback((repoId: string) => {
    setCreateWorkspaceRepoId(repoId);
    setIsCreateWorkspaceOpen(true);
  }, []);

  useEffect(() => {
    const handleOpenCreateWorkspaceDialog = (event: Event) => {
      const customEvent = event as CustomEvent<{ repoId?: string }>;
      const requestedRepoId = customEvent.detail?.repoId?.trim();
      if (!requestedRepoId) {
        return;
      }

      handleOpenCreateWorkspace(requestedRepoId);
    };

    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleOpenCreateWorkspaceDialog as EventListener);
    return () => {
      window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleOpenCreateWorkspaceDialog as EventListener);
    };
  }, [handleOpenCreateWorkspace]);

  /** Opens the repo config dialog for one selected repository id. */
  const handleOpenRepoConfig = (repoId: string) => {
    setRepoConfigRepoId(repoId);
    setIsRepoConfigOpen(true);
  };

  /** Opens confirmation dialog for deleting a workspace row. */
  const handleRequestWorkspaceDeletion = (repoId: string, workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId && item.repoId === repoId);
    if (!workspace) {
      return;
    }

    setPendingWorkspaceDeletion({
      repoId,
      workspaceId,
      workspaceName: workspace.name,
      allowRemoveBranch: true,
    });
  };

  /** Clears workspace deletion confirmation state when cancellation is allowed. */
  const handleCancelWorkspaceDeletion = () => {
    if (isDeletingWorkspace) {
      return;
    }

    setPendingWorkspaceDeletion(null);
  };

  /** Deletes the selected workspace after the user confirms in the dialog. */
  const handleConfirmWorkspaceDeletion = async () => {
    if (!pendingWorkspaceDeletion) {
      return;
    }

    setIsDeletingWorkspace(true);
    try {
      await closeWorkspace(pendingWorkspaceDeletion.workspaceId, {
        removeBranch: pendingWorkspaceDeletion.allowRemoveBranch,
      });
      setPendingWorkspaceDeletion(null);
    } finally {
      setIsDeletingWorkspace(false);
    }
  };

  /** Opens confirmation dialog for deleting a repository row. */
  const handleRequestRepoDeletion = (repoId: string) => {
    const repo = projects.find((item) => item.id === repoId);
    if (!repo) {
      return;
    }

    setPendingRepoDeletion({
      repoId,
      repoName: repo.name,
    });
  };

  /** Clears repository deletion confirmation state when cancellation is allowed. */
  const handleCancelRepoDeletion = () => {
    if (isDeletingRepo) {
      return;
    }

    setPendingRepoDeletion(null);
  };

  /** Deletes the selected repository after the user confirms in the dialog. */
  const handleConfirmRepoDeletion = () => {
    if (!pendingRepoDeletion) {
      return;
    }

    deleteProjectMutation.mutate(pendingRepoDeletion.repoId);
  };

  useEffect(() => {
    return () => {
      if (!workspaceInfoCloseTimerRef.current) {
        return;
      }

      clearTimeout(workspaceInfoCloseTimerRef.current);
      workspaceInfoCloseTimerRef.current = null;
    };
  }, []);

  /** Toggles whether one repository row is folded in the list UI. */
  const toggleRepoFold = (repoId: string) => {
    setFoldedRepoIds((current) =>
      current.includes(repoId) ? current.filter((item) => item !== repoId) : [...current, repoId],
    );
  };

  /** Clears any pending delayed close for the workspace info popover. */
  const clearWorkspaceInfoCloseTimer = () => {
    if (!workspaceInfoCloseTimerRef.current) {
      return;
    }

    clearTimeout(workspaceInfoCloseTimerRef.current);
    workspaceInfoCloseTimerRef.current = null;
  };

  /** Schedules delayed close so users can move cursor from row into the popover. */
  const scheduleWorkspaceInfoClose = () => {
    clearWorkspaceInfoCloseTimer();
    workspaceInfoCloseTimerRef.current = setTimeout(() => {
      setHoveredWorkspaceId("");
      setWorkspaceInfoAnchorEl(null);
      workspaceInfoCloseTimerRef.current = null;
    }, workspaceInfoCloseDelayMs);
  };

  /** Opens the workspace details popover while hovering one workspace row. */
  const handleWorkspaceInfoMouseEnter = (workspaceId: string, anchorEl: HTMLElement) => {
    clearWorkspaceInfoCloseTimer();
    setHoveredWorkspaceId(workspaceId);
    setWorkspaceInfoAnchorEl(anchorEl);
  };

  /** Closes the workspace details popover when the cursor leaves a workspace row. */
  const handleWorkspaceInfoMouseLeave = () => {
    scheduleWorkspaceInfoClose();
  };

  /** Keeps the popover open while the cursor is inside it. */
  const handleWorkspaceInfoPopoverMouseEnter = () => {
    clearWorkspaceInfoCloseTimer();
  };

  /** Starts delayed close when the cursor leaves the popover surface. */
  const handleWorkspaceInfoPopoverMouseLeave = () => {
    scheduleWorkspaceInfoClose();
  };

  const hoveredWorkspace = workspaces.find((workspace) => workspace.id === hoveredWorkspaceId);
  const isWorkspaceInfoOpen = Boolean(workspaceInfoAnchorEl) && Boolean(hoveredWorkspace);
  useSuppressNativeContextMenuWhileOpen(isRepoContextMenuOpen || isWorkspaceContextMenuOpen);

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

  const repoContextMenuItems: ContextMenuEntry[] = [
    {
      id: "repo-config",
      label: t("project.actions.config"),
      icon: <LuSettings size={14} />,
      onSelect: () => {
        if (!repoContextMenu) {
          return;
        }

        handleOpenRepoConfig(repoContextMenu.repoId);
      },
    },
    {
      id: "repo-delete",
      label: t("project.actions.delete"),
      icon: <LuTrash2 size={14} />,
      onSelect: () => {
        if (!repoContextMenu) {
          return;
        }

        handleRequestRepoDeletion(repoContextMenu.repoId);
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
                repoId: workspace.repoId,
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
  const repoContextMenuAnchorPosition = useMemo(
    () =>
      repoContextMenu
        ? {
            top: repoContextMenu.mouseY,
            left: repoContextMenu.mouseX,
          }
        : undefined,
    [repoContextMenu],
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
      <List data-testid="repo-workspace-list" disablePadding sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {filteredProjects.map((repo) => {
          const isRepoFolded = foldedRepoIds.includes(repo.id);
          const localDisplayWorkspaceId = displayWorkspaceIdByProjectId[repo.id];
          const repoWorkspaces = workspaceByProjectId[repo.id] ?? [];
          const displayedWorkspaces = localDisplayWorkspaceId
            ? repoWorkspaces.filter((workspace) => workspace.kind !== "local")
            : repoWorkspaces;

          return (
            <Box key={repo.id} sx={{ mb: 0.5 }}>
              <ProjectRow
                repo={repo}
                isSelected={selectedProjectId === repo.id}
                isFolded={isRepoFolded}
                addWorkspaceAriaLabel={t("workspace.actions.add")}
                addWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
                foldToggleAriaLabel={t(isRepoFolded ? "repo.actions.expand" : "repo.actions.collapse")}
                onSelect={() => {
                  setSelectedRepoId(repo.id);
                  setFoldedRepoIds((current) => current.filter((item) => item !== repo.id));
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeWorkspaceMenus();
                  setSelectedRepoId(repo.id);
                  openRepoContextMenu({
                    repoId: repo.id,
                    mouseX: event.clientX,
                    mouseY: event.clientY,
                  });
                }}
                onAddWorkspace={(event) => {
                  event.stopPropagation();
                  handleOpenCreateWorkspace(repo.id);
                }}
                onToggleFold={(event) => {
                  event.stopPropagation();
                  toggleRepoFold(repo.id);
                }}
              />
              {!isRepoFolded ? (
                <List disablePadding sx={{ mt: 0.25 }}>
                  {displayedWorkspaces.map((workspace) => {
                    const isWorkspaceDisplayedAsLocal =
                      workspace.kind === "local" || localDisplayWorkspaceId === workspace.id;
                    const workspaceForRow = isWorkspaceDisplayedAsLocal
                      ? {
                          ...workspace,
                          kind: "local" as const,
                          name: "local",
                          title: "local",
                        }
                      : workspace;
                    const workspaceRuntimeStatus = workspaceAgentStatusByWorkspaceId[workspace.id] ?? "idle";
                    const workspaceIndicator = resolveWorkspaceIndicator({
                      runtimeStatus: workspaceRuntimeStatus,
                      unreadTone: workspaceUnreadToneByWorkspaceId[workspace.id],
                    });
                    return (
                      <WorkspaceRow
                        key={workspace.id}
                        repoId={repo.id}
                        workspace={workspaceForRow}
                        isSelected={selectedWorkspaceId === workspace.id}
                        indicator={workspaceIndicator}
                        changeTotals={gitChangeTotalsByWorkspaceId[workspace.id]}
                        deleteWorkspaceLabel={t("workspace.actions.delete")}
                        runningIndicatorLabel={t("workspace.notifications.runningIndicator")}
                        waitingInputIndicatorLabel={t("workspace.notifications.waitingInputIndicator")}
                        doneIndicatorLabel={t("workspace.notifications.doneIndicator")}
                        failedIndicatorLabel={t("workspace.notifications.failedIndicator")}
                        onSelect={() => {
                          setSelectedRepoId(repo.id);
                          setSelectedWorkspaceId(workspace.id);
                          setFoldedRepoIds((current) => current.filter((item) => item !== repo.id));
                        }}
                        onMouseEnter={(event) => {
                          handleWorkspaceInfoMouseEnter(workspace.id, event.currentTarget);
                        }}
                        onMouseLeave={handleWorkspaceInfoMouseLeave}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          closeRepoContextMenu();
                          closeWorkspaceMenus();
                          setSelectedRepoId(repo.id);
                          setSelectedWorkspaceId(workspace.id);
                          openWorkspaceContextMenu({
                            repoId: repo.id,
                            workspaceId: workspace.id,
                            mouseX: event.clientX,
                            mouseY: event.clientY,
                          });
                        }}
                        onRequestDelete={handleRequestWorkspaceDeletion}
                      />
                    );
                  })}
                </List>
              ) : null}
            </Box>
          );
        })}
      </List>
      <ContextMenu
        open={Boolean(repoContextMenu)}
        onClose={closeAllContextMenus}
        anchorPosition={repoContextMenuAnchorPosition}
        items={repoContextMenuItems}
      />
      <ContextMenu
        open={Boolean(workspaceContextMenu)}
        onClose={closeWorkspaceMenus}
        anchorPosition={workspaceContextMenuAnchorPosition}
        items={workspaceContextMenuItems}
      />
      <CreateWorkspaceDialogView
        open={isCreateWorkspaceOpen}
        repoId={createWorkspaceRepoId}
        onClose={() => {
          setIsCreateWorkspaceOpen(false);
          setCreateWorkspaceRepoId("");
        }}
      />
      <CreateWorkspaceDialogView
        mode="rename"
        open={Boolean(renameWorkspaceContext)}
        repoId={renameWorkspaceContext?.repoId ?? ""}
        workspaceId={renameWorkspaceContext?.workspaceId ?? ""}
        onClose={() => {
          setRenameWorkspaceContext(null);
        }}
      />
      <ProjectConfigDialogView
        open={isRepoConfigOpen}
        repoId={repoConfigRepoId}
        onClose={() => {
          setIsRepoConfigOpen(false);
          setRepoConfigRepoId("");
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
        open={Boolean(pendingRepoDeletion)}
        repoName={pendingRepoDeletion?.repoName ?? ""}
        isDeleting={isDeletingRepo}
        onCancel={handleCancelRepoDeletion}
        onConfirm={() => void handleConfirmRepoDeletion()}
      />
      <WorkspaceInfoPopperView
        open={isWorkspaceInfoOpen}
        anchorEl={workspaceInfoAnchorEl}
        workspace={hoveredWorkspace}
        onMouseEnter={handleWorkspaceInfoPopoverMouseEnter}
        onMouseLeave={handleWorkspaceInfoPopoverMouseLeave}
      />
    </>
  );
}
