import { ListItemIcon, Menu, MenuItem } from "@mui/material";
import type { GitPullRequest, GitPullRequestSummary } from "@renderer/domains/git";
import type { PendingWorkspaceDeletion, WorkspaceItem } from "@renderer/domains/workspace";
import type { TFunction } from "i18next";
import type { Dispatch, SetStateAction } from "react";
import { LuSettings, LuTrash2 } from "react-icons/lu";
import type { ExternalAppId, ExternalAppMenuEntry } from "../../../../shared/contracts/externalApps";
import { ProjectListContextMenus } from "./ProjectListContextMenus";
import { ProjectListDialogOverlays } from "./ProjectListDialogOverlays";

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
  externalAppMenuEntries: readonly ExternalAppMenuEntry[];
  lastUsedWorkspaceExternalAppPreset: { id: ExternalAppId; label: string; iconSrc: string } | null;
  openWorkspaceInLastUsedExternalAppActionLabel: string;
  openWorkspaceInFileManagerActionLabel: string;
  closeAllContextMenus: () => void;
  closeWorkspaceMenus: () => void;
  closeProjectContextMenu: () => void;
  handleOpenProjectConfig: (projectId: string) => void;
  handleRequestProjectDeletion: (projectId: string) => void;
  handleRequestWorkspaceDeletion: (projectId: string, workspaceId: string) => void;
  handleDeleteLocalFolder: (folderId: string) => void;
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
  hoveredWorkspacePullRequest: GitPullRequest | undefined;
  hoveredWorkspaceLatestPullRequest: GitPullRequestSummary | undefined;
  handleWorkspaceInfoPopoverMouseEnter: () => void;
  handleWorkspaceInfoPopoverMouseLeave: () => void;
};

export function ProjectListMenus(props: ProjectListMenusProps) {
  const closeProjectActionsMenu = () => {
    props.setProjectActionsAnchorEl(null);
    props.setProjectActionsProjectId("");
  };

  return (
    <>
      <Menu
        open={Boolean(props.projectActionsAnchorEl && props.projectActionsProjectId)}
        anchorEl={props.projectActionsAnchorEl}
        onClose={closeProjectActionsMenu}
      >
        <MenuItem
          onClick={() => {
            if (!props.projectActionsProjectId) {
              return;
            }

            props.handleOpenProjectConfig(props.projectActionsProjectId);
            closeProjectActionsMenu();
          }}
        >
          <ListItemIcon>
            <LuSettings size={14} />
          </ListItemIcon>
          {props.t("project.actions.config")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!props.projectActionsProjectId) {
              return;
            }

            props.handleRequestProjectDeletion(props.projectActionsProjectId);
            closeProjectActionsMenu();
          }}
        >
          <ListItemIcon>
            <LuTrash2 size={14} />
          </ListItemIcon>
          {props.t("project.actions.delete")}
        </MenuItem>
      </Menu>
      <ProjectListContextMenus
        t={props.t}
        projectContextMenu={props.projectContextMenu}
        workspaceContextMenu={props.workspaceContextMenu}
        workspaces={props.workspaces}
        displayWorkspaceIdByProjectId={props.displayWorkspaceIdByProjectId}
        canOpenWorkspaceInExternalApp={props.canOpenWorkspaceInExternalApp}
        externalAppMenuEntries={props.externalAppMenuEntries}
        lastUsedWorkspaceExternalAppPreset={props.lastUsedWorkspaceExternalAppPreset}
        openWorkspaceInLastUsedExternalAppActionLabel={props.openWorkspaceInLastUsedExternalAppActionLabel}
        openWorkspaceInFileManagerActionLabel={props.openWorkspaceInFileManagerActionLabel}
        closeAllContextMenus={props.closeAllContextMenus}
        closeWorkspaceMenus={props.closeWorkspaceMenus}
        handleOpenProjectConfig={props.handleOpenProjectConfig}
        handleRequestProjectDeletion={props.handleRequestProjectDeletion}
        handleRequestWorkspaceDeletion={props.handleRequestWorkspaceDeletion}
        handleDeleteLocalFolder={props.handleDeleteLocalFolder}
        handleOpenWorkspaceInExternalApp={props.handleOpenWorkspaceInExternalApp}
        handleOpenWorkspaceInFileManager={props.handleOpenWorkspaceInFileManager}
        setRenameWorkspaceContext={props.setRenameWorkspaceContext}
        projectContextMenuAnchorPosition={props.projectContextMenuAnchorPosition}
        workspaceContextMenuAnchorPosition={props.workspaceContextMenuAnchorPosition}
      />
      <ProjectListDialogOverlays
        isCreateWorkspaceOpen={props.isCreateWorkspaceOpen}
        createWorkspaceProjectId={props.createWorkspaceProjectId}
        setIsCreateWorkspaceOpen={props.setIsCreateWorkspaceOpen}
        setCreateWorkspaceProjectId={props.setCreateWorkspaceProjectId}
        renameWorkspaceContext={props.renameWorkspaceContext}
        setRenameWorkspaceContext={props.setRenameWorkspaceContext}
        isProjectConfigOpen={props.isProjectConfigOpen}
        projectConfigProjectId={props.projectConfigProjectId}
        setIsProjectConfigOpen={props.setIsProjectConfigOpen}
        setProjectConfigProjectId={props.setProjectConfigProjectId}
        pendingWorkspaceDeletion={props.pendingWorkspaceDeletion}
        isDeletingWorkspace={props.isDeletingWorkspace}
        handleCancelWorkspaceDeletion={props.handleCancelWorkspaceDeletion}
        handleConfirmWorkspaceDeletion={props.handleConfirmWorkspaceDeletion}
        setPendingWorkspaceDeletion={props.setPendingWorkspaceDeletion}
        pendingProjectDeletion={props.pendingProjectDeletion}
        isDeletingProject={props.isDeletingProject}
        handleCancelProjectDeletion={props.handleCancelProjectDeletion}
        handleConfirmProjectDeletion={props.handleConfirmProjectDeletion}
        isWorkspaceInfoOpen={props.isWorkspaceInfoOpen}
        workspaceInfoAnchorEl={props.workspaceInfoAnchorEl}
        hoveredWorkspace={props.hoveredWorkspace}
        isHoveredWorkspacePrimary={props.isHoveredWorkspacePrimary}
        hoveredWorkspaceCurrentBranch={props.hoveredWorkspaceCurrentBranch}
        hoveredWorkspacePullRequest={props.hoveredWorkspacePullRequest}
        hoveredWorkspaceLatestPullRequest={props.hoveredWorkspaceLatestPullRequest}
        handleWorkspaceInfoPopoverMouseEnter={props.handleWorkspaceInfoPopoverMouseEnter}
        handleWorkspaceInfoPopoverMouseLeave={props.handleWorkspaceInfoPopoverMouseLeave}
      />
    </>
  );
}
