import { closePullRequest, mergePullRequest } from "@renderer/commands/gitCommands";
import { getErrorMessage } from "@renderer/helpers/errorHelpers";
import type { DaemonWorkspacePullRequest } from "@renderer/rpc/daemonTypes";
import { workspaceStore } from "@renderer/store/workspaceStore";
import { type MouseEvent, useCallback, useState } from "react";
import type { MergeMethod } from "./pullRequestTabHelpers";

type PullRequestActionStatus = "closed" | "merged";
type UsePullRequestTabActionsParams = {
  hasLivePr: boolean;
  mergeMethod: MergeMethod;
  prBaseBranch: string | undefined;
  prBranch: string | undefined;
  prNumber: number | undefined;
  prTitle: string | undefined;
  prUrl: string | undefined;
  pullRequest: DaemonWorkspacePullRequest | undefined;
  refreshWorkspacePullRequest: (workspaceId: string) => Promise<unknown>;
  selectedWorkspaceId: string;
  worktreePath: string | undefined;
};
export type PullRequestTabActionsState = {
  actionError: string | null;
  deleteBranch: boolean;
  isClosing: boolean;
  isMerging: boolean;
  isRefreshing: boolean;
  mergeAnchorEl: HTMLElement | null;
  mergeMenuOpen: boolean;
  setActionError: (error: string | null) => void;
  setDeleteBranch: (checked: boolean) => void;
  handleClose: () => Promise<void>;
  handleCloseMergeMenu: () => void;
  handleMerge: () => Promise<void>;
  handleOpenMergeMenu: (event: MouseEvent<HTMLElement>) => void;
  handleRefresh: () => Promise<void>;
};
function buildCompletedPullRequest(
  params: UsePullRequestTabActionsParams,
  status: PullRequestActionStatus,
): DaemonWorkspacePullRequest {
  return {
    number: params.prNumber ?? 0,
    title: params.prTitle ?? "",
    url: params.prUrl ?? "",
    branch: params.prBranch ?? "",
    baseBranch: params.prBaseBranch ?? "",
    complete: true,
    status,
    ...(status === "closed" ? { githubState: "CLOSED" } : {}),
  };
}
/** Manages merge, close, and refresh UI state for the pull request tab. */
export function usePullRequestTabActions(params: UsePullRequestTabActionsParams): PullRequestTabActionsState {
  const [mergeAnchorEl, setMergeAnchorEl] = useState<HTMLElement | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const updateWorkspacePullRequest = useCallback(
    (status: PullRequestActionStatus) => {
      const state = workspaceStore.getState();
      state.setWorkspacePullRequest(
        params.selectedWorkspaceId,
        params.hasLivePr && params.pullRequest
          ? {
              ...params.pullRequest,
              ...(status === "merged" ? { complete: true } : {}),
              status,
              ...(status === "closed" ? { githubState: "CLOSED" } : {}),
            }
          : buildCompletedPullRequest(params, status),
      );
    },
    [params],
  );

  const handleOpenMergeMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    setMergeAnchorEl(event.currentTarget);
  }, []);
  const handleCloseMergeMenu = useCallback(() => setMergeAnchorEl(null), []);

  const handleMerge = useCallback(async () => {
    if (!params.prNumber || !params.selectedWorkspaceId || !params.worktreePath || isMerging) return;
    setIsMerging(true);
    setActionError(null);
    try {
      await mergePullRequest({
        workspaceId: params.selectedWorkspaceId,
        prNumber: params.prNumber,
        method: params.mergeMethod,
        deleteBranch,
      });
      updateWorkspacePullRequest("merged");
    } catch (error: unknown) {
      console.error("[PullRequestTabView] merge failed", error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsMerging(false);
    }
  }, [deleteBranch, isMerging, params, updateWorkspacePullRequest]);

  const handleClose = useCallback(async () => {
    if (!params.prNumber || !params.selectedWorkspaceId || !params.worktreePath || isClosing) return;
    setIsClosing(true);
    setActionError(null);
    try {
      await closePullRequest({ workspaceId: params.selectedWorkspaceId, prNumber: params.prNumber });
      updateWorkspacePullRequest("closed");
    } catch (error: unknown) {
      console.error("[PullRequestTabView] close failed", error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsClosing(false);
    }
  }, [isClosing, params, updateWorkspacePullRequest]);

  const handleRefresh = useCallback(async () => {
    if (!params.selectedWorkspaceId || !params.worktreePath || isRefreshing) return;
    setIsRefreshing(true);
    setActionError(null);
    try {
      await params.refreshWorkspacePullRequest(params.selectedWorkspaceId);
    } catch (error: unknown) {
      console.error("[PullRequestTabView] refresh failed", error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, params]);

  return {
    actionError,
    deleteBranch,
    isClosing,
    isMerging,
    isRefreshing,
    mergeAnchorEl,
    mergeMenuOpen: Boolean(mergeAnchorEl),
    setActionError,
    setDeleteBranch,
    handleClose,
    handleCloseMergeMenu,
    handleMerge,
    handleOpenMergeMenu,
    handleRefresh,
  };
}
