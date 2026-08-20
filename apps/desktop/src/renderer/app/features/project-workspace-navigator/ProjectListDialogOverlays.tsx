import type { GitPullRequest, GitPullRequestSummary } from "@renderer/domains/git";
import { ProjectConfigDialogView, ProjectDeleteDialogView } from "@renderer/domains/project";
import {
  CreateWorkspaceDialogView,
  RenameWorkspaceDialogView,
  WorkspaceDeleteDialogView,
  WorkspaceInfoPopperView,
} from "@renderer/domains/workspace";
import type { PendingWorkspaceDeletion, WorkspaceItem } from "@renderer/domains/workspace";
import type { Dispatch, SetStateAction } from "react";

type ProjectListDialogOverlaysProps = {
  isCreateWorkspaceOpen: boolean;
  createWorkspaceProjectId: string;
  setIsCreateWorkspaceOpen: (value: boolean) => void;
  setCreateWorkspaceProjectId: (value: string) => void;
  renameWorkspaceContext: { projectId: string; workspaceId: string } | null;
  setRenameWorkspaceContext: (value: { projectId: string; workspaceId: string } | null) => void;
  isProjectConfigOpen: boolean;
  projectConfigProjectId: string;
  setIsProjectConfigOpen: (value: boolean) => void;
  setProjectConfigProjectId: (value: string) => void;
  pendingWorkspaceDeletion: PendingWorkspaceDeletion | null;
  isDeletingWorkspace: boolean;
  handleCancelWorkspaceDeletion: () => void;
  handleConfirmWorkspaceDeletion: () => Promise<void>;
  setPendingWorkspaceDeletion: Dispatch<SetStateAction<PendingWorkspaceDeletion | null>>;
  pendingProjectDeletion: { projectName: string } | null;
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

export function ProjectListDialogOverlays({
  isCreateWorkspaceOpen,
  createWorkspaceProjectId,
  setIsCreateWorkspaceOpen,
  setCreateWorkspaceProjectId,
  renameWorkspaceContext,
  setRenameWorkspaceContext,
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
}: ProjectListDialogOverlaysProps) {
  return (
    <>
      <CreateWorkspaceDialogView
        open={isCreateWorkspaceOpen}
        projectId={createWorkspaceProjectId}
        onClose={() => {
          setIsCreateWorkspaceOpen(false);
          setCreateWorkspaceProjectId("");
        }}
      />
      <RenameWorkspaceDialogView
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
