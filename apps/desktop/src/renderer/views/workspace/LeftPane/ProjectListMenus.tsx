import { Box, ListItemIcon, Menu, MenuItem } from "@mui/material";
import type { TFunction } from "i18next";
import type { Dispatch, SetStateAction } from "react";
import { LuSettings, LuTrash2 } from "react-icons/lu";
import {
  EXTERNAL_APP_MENU_ENTRIES,
  type ExternalAppId,
  JETBRAINS_EXTERNAL_APP_IDS,
  findExternalAppPreset,
} from "../../../../shared/contracts/externalApps";
import type { WorkspacePullRequestSummary } from "../../../api/types";
import { ContextMenu, type ContextMenuEntry } from "../../../components/ContextMenu";
import type { DaemonWorkspacePullRequest } from "../../../rpc/daemonTypes";
import type { WorkspaceItem } from "../../../store/types";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";
import { ProjectDeleteDialogView } from "./ProjectDeleteDialogView";
import { WorkspaceDeleteDialogView } from "./WorkspaceDeleteDialogView";
import { WorkspaceInfoPopperView } from "./WorkspaceInfoPopperView";
import type { PendingWorkspaceDeletion } from "./useWorkspaceDeletionFlow";

type PendingProjectDeletion = {
  projectName: string;
} | null;

type RenameWorkspaceContext = {
  projectId: string;
  workspaceId: string;
} | null;

type ProjectContextMenuState = {
  repoId: string;
  mouseX: number;
  mouseY: number;
} | null;

type WorkspaceContextMenuState = {
  repoId: string;
  workspaceId: string;
  mouseX: number;
  mouseY: number;
} | null;

type ProjectListMenusProps = {
  t: TFunction;
  projectContextMenu: ProjectContextMenuState;
  workspaceContextMenu: WorkspaceContextMenuState;
  workspaces: WorkspaceItem[];
  displayWorkspaceIdByProjectId: Record<string, string>;
  canOpenWorkspaceInExternalApp: boolean;
  lastUsedWorkspaceExternalAppPreset: { id: ExternalAppId; label: string; iconSrc: string } | null;
  openWorkspaceInLastUsedExternalAppActionLabel: string;
  openWorkspaceInFileManagerActionLabel: string;
  closeAllContextMenus: () => void;
  closeWorkspaceMenus: () => void;
  closeProjectContextMenu: () => void;
  handleOpenProjectConfig: (projectId: string) => void;
  handleRequestProjectDeletion: (projectId: string) => void;
  handleRequestWorkspaceDeletion: (projectId: string, workspaceId: string) => void;
  handleOpenWorkspaceInExternalApp: (appId: ExternalAppId) => Promise<void>;
  handleOpenWorkspaceInFileManager: () => Promise<void>;
  setRenameWorkspaceContext: (value: RenameWorkspaceContext) => void;
  projectActionsAnchorEl: HTMLElement | null;
  setProjectActionsAnchorEl: (value: HTMLElement | null) => void;
  projectActionsProjectId: string;
  setProjectActionsProjectId: (value: string) => void;
  projectContextMenuAnchorPosition: { top: number; left: number } | undefined;
  workspaceContextMenuAnchorPosition: { top: number; left: number } | undefined;
  isCreateWorkspaceOpen: boolean;
  createWorkspaceProjectId: string;
  setIsCreateWorkspaceOpen: (value: boolean) => void;
  setCreateWorkspaceProjectId: (value: string) => void;
  renameWorkspaceContext: RenameWorkspaceContext;
  isProjectConfigOpen: boolean;
  projectConfigProjectId: string;
  setIsProjectConfigOpen: (value: boolean) => void;
  setProjectConfigProjectId: (value: string) => void;
  pendingWorkspaceDeletion: PendingWorkspaceDeletion | null;
  isDeletingWorkspace: boolean;
  handleCancelWorkspaceDeletion: () => void;
  handleConfirmWorkspaceDeletion: () => Promise<void>;
  setPendingWorkspaceDeletion: Dispatch<SetStateAction<PendingWorkspaceDeletion | null>>;
  pendingProjectDeletion: PendingProjectDeletion;
  isDeletingProject: boolean;
  handleCancelProjectDeletion: () => void;
  handleConfirmProjectDeletion: () => void;
  isWorkspaceInfoOpen: boolean;
  workspaceInfoAnchorEl: HTMLElement | null;
  hoveredWorkspace: WorkspaceItem | undefined;
  isHoveredWorkspacePrimary: boolean;
  hoveredWorkspaceCurrentBranch: string | undefined;
  hoveredWorkspacePullRequest: DaemonWorkspacePullRequest | undefined;
  hoveredWorkspaceLatestPullRequest: WorkspacePullRequestSummary | undefined;
  handleWorkspaceInfoPopoverMouseEnter: () => void;
  handleWorkspaceInfoPopoverMouseLeave: () => void;
};

export function ProjectListMenus({
  t,
  projectContextMenu,
  workspaceContextMenu,
  workspaces,
  displayWorkspaceIdByProjectId,
  canOpenWorkspaceInExternalApp,
  lastUsedWorkspaceExternalAppPreset,
  openWorkspaceInLastUsedExternalAppActionLabel,
  openWorkspaceInFileManagerActionLabel,
  closeAllContextMenus,
  closeWorkspaceMenus,
  closeProjectContextMenu,
  handleOpenProjectConfig,
  handleRequestProjectDeletion,
  handleRequestWorkspaceDeletion,
  handleOpenWorkspaceInExternalApp,
  handleOpenWorkspaceInFileManager,
  setRenameWorkspaceContext,
  projectActionsAnchorEl,
  setProjectActionsAnchorEl,
  projectActionsProjectId,
  setProjectActionsProjectId,
  projectContextMenuAnchorPosition,
  workspaceContextMenuAnchorPosition,
  isCreateWorkspaceOpen,
  createWorkspaceProjectId,
  setIsCreateWorkspaceOpen,
  setCreateWorkspaceProjectId,
  renameWorkspaceContext,
  isProjectConfigOpen,
  projectConfigProjectId,
  setIsProjectConfigOpen,
  setProjectConfigProjectId,
  pendingWorkspaceDeletion,
  isDeletingWorkspace,
  handleCancelWorkspaceDeletion,
  handleConfirmWorkspaceDeletion,
  setPendingWorkspaceDeletion,
  pendingProjectDeletion,
  isDeletingProject,
  handleCancelProjectDeletion,
  handleConfirmProjectDeletion,
  isWorkspaceInfoOpen,
  workspaceInfoAnchorEl,
  hoveredWorkspace,
  isHoveredWorkspacePrimary,
  hoveredWorkspaceCurrentBranch,
  hoveredWorkspacePullRequest,
  hoveredWorkspaceLatestPullRequest,
  handleWorkspaceInfoPopoverMouseEnter,
  handleWorkspaceInfoPopoverMouseLeave,
}: ProjectListMenusProps) {
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

  const workspaceContextTarget =
    workspaceContextMenu &&
    workspaces.find(
      (workspace) =>
        workspace.repoId === workspaceContextMenu.repoId && workspace.id === workspaceContextMenu.workspaceId,
    );
  const isWorkspaceContextTargetLocal = Boolean(
    workspaceContextTarget &&
      (workspaceContextTarget.kind === "local" ||
        displayWorkspaceIdByProjectId[workspaceContextTarget.repoId] === workspaceContextTarget.id),
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

  return (
    <>
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
