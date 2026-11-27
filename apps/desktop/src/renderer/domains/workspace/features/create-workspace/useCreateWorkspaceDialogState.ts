import { useGitAuthorName } from "@renderer/domains/git";
import type { WorkspaceProjectRecord } from "@renderer/domains/project";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceItem } from "../../../../domains/workspace/workspaceTypes";
import { resolveGitBranchPrefix } from "../../naming/branchPrefix";
import type { GitBranchPrefixMode } from "../../naming/branchPrefix";
import type { BranchDropdownGroups } from "./BranchDropdown";
import { resolveSourceBranchGroups } from "./createWorkspaceForm";
import {
  resolveSourceBranchState,
  resolveTargetBranchForCreate,
  suggestTargetBranchName,
} from "./workspaceBranchNaming";

type UseCreateWorkspaceDialogStateInput = {
  open: boolean;
  projectId: string;
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
  prefixMode: GitBranchPrefixMode;
  customPrefix: string;
  listGitBranches: (input: { workspaceId?: string; workspaceWorktreePath?: string }) => Promise<{
    branches?: string[];
    localBranches?: string[];
    remoteBranches?: string[];
    worktreeBranches?: string[];
  }>;
};

export type UseCreateWorkspaceDialogStateResult = {
  selectedProjectId: string;
  setSelectedProjectId: React.Dispatch<React.SetStateAction<string>>;
  sourceBranchOptions: string[];
  sourceBranchGroups: BranchDropdownGroups;
  sourceBranch: string;
  setSourceBranch: React.Dispatch<React.SetStateAction<string>>;
  sourceBranchMenuAnchorEl: HTMLElement | null;
  setSourceBranchMenuAnchorEl: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  isLoadingSourceBranches: boolean;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  targetBranch: string;
  setTargetBranch: React.Dispatch<React.SetStateAction<string>>;
  hasEditedTargetBranchRef: React.MutableRefObject<boolean>;
  isCreatingWorkspace: boolean;
  setIsCreatingWorkspace: React.Dispatch<React.SetStateAction<boolean>>;
  resetDraftInputs: () => void;
  selectedProject: WorkspaceProjectRecord | undefined;
  selectedProjectBranchListPath: string;
  defaultBranchPrefix: string;
  taskPrompt: string;
  setTaskPrompt: React.Dispatch<React.SetStateAction<string>>;
  taskModel: string;
  setTaskModel: React.Dispatch<React.SetStateAction<string>>;
};

/** Manages draft state, branch loading, and prefix-derived defaults for the workspace dialog. */
export function useCreateWorkspaceDialogState({
  open,
  projectId,
  projects,
  workspaces,
  prefixMode,
  customPrefix,
  listGitBranches,
}: UseCreateWorkspaceDialogStateInput): UseCreateWorkspaceDialogStateResult {
  const [selectedProjectId, setSelectedProjectId] = useState(() =>
    projects.some((project) => project.id === projectId) ? projectId : (projects[0]?.id ?? ""),
  );
  const [sourceBranchOptions, setSourceBranchOptions] = useState<string[]>([]);
  const [sourceBranchGroups, setSourceBranchGroups] = useState<BranchDropdownGroups>({
    localBranches: [],
    worktreeBranches: [],
    remoteBranches: [],
  });
  const [sourceBranch, setSourceBranch] = useState("");
  const [sourceBranchMenuAnchorEl, setSourceBranchMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [isLoadingSourceBranches, setIsLoadingSourceBranches] = useState(false);
  const [name, setName] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const hasEditedTargetBranchRef = useRef(false);
  const hasSyncedRepoIdForOpenRef = useRef(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [taskModel, setTaskModel] = useState("");

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedProjectBranchListPath =
    selectedProject?.localPath?.trim() || selectedProject?.path?.trim() || selectedProject?.worktreePath?.trim() || "";
  const selectedProjectBranchListWorkspaceId =
    workspaces.find(
      (workspace) =>
        workspace.repoId === selectedProjectId &&
        workspace.kind !== "local" &&
        workspace.worktreePath?.trim() === selectedProjectBranchListPath,
    )?.id ?? "";
  const gitAuthorNamePath = open && prefixMode === "user" ? selectedProjectBranchListPath : "";
  const resolvedGitUserName = useGitAuthorName(gitAuthorNamePath);
  const resolvedPrefix = resolveGitBranchPrefix({
    prefixMode,
    customPrefix,
    gitUserName: resolvedGitUserName,
  });
  const defaultBranchPrefix = resolvedPrefix ? `${resolvedPrefix}/` : "";

  const resetDraftInputs = () => {
    setName("");
    setTargetBranch("");
    hasEditedTargetBranchRef.current = false;
    setTaskPrompt("");
    setTaskModel("");
  };

  useEffect(() => {
    if (!open) {
      hasSyncedRepoIdForOpenRef.current = false;
      return;
    }
    if (hasSyncedRepoIdForOpenRef.current) {
      return;
    }
    hasSyncedRepoIdForOpenRef.current = true;
    hasEditedTargetBranchRef.current = false;
    setTaskPrompt("");
    setTaskModel("");
    setSelectedProjectId((currentProjectId) => {
      if (projects.some((project) => project.id === projectId)) {
        return projectId;
      }
      if (projects.some((project) => project.id === currentProjectId)) {
        return currentProjectId;
      }
      return projects[0]?.id ?? "";
    });
  }, [open, projectId, projects]);

  useEffect(() => {
    if (!open || hasEditedTargetBranchRef.current) {
      return;
    }
    const nextTargetBranch = suggestTargetBranchName(name, defaultBranchPrefix);
    setTargetBranch((currentValue) => (currentValue === nextTargetBranch ? currentValue : nextTargetBranch));
  }, [defaultBranchPrefix, name, open]);

  useEffect(() => {
    if (!open || !selectedProjectBranchListPath) {
      setSourceBranchOptions([]);
      setSourceBranchGroups({
        localBranches: [],
        worktreeBranches: [],
        remoteBranches: [],
      });
      setSourceBranch("");
      setIsLoadingSourceBranches(false);
      return;
    }

    let isCancelled = false;

    const applySourceBranchState = (branches: string[], nextGroups?: BranchDropdownGroups) => {
      const nextSourceBranchState = resolveSourceBranchState(branches, selectedProject?.defaultBranch ?? "");
      const resolvedGroups = nextGroups ?? resolveSourceBranchGroups({ branches: nextSourceBranchState.options });
      const remotePreferredBranch =
        resolvedGroups.remoteBranches.find((branch) => branch === "origin/main" || branch === "origin/master") ?? "";
      const preferredBranch = remotePreferredBranch || nextSourceBranchState.preferred;
      setSourceBranchOptions(nextSourceBranchState.options);
      setSourceBranchGroups(resolvedGroups);
      setSourceBranch((currentValue) =>
        currentValue && nextSourceBranchState.options.includes(currentValue) ? currentValue : preferredBranch,
      );
    };

    const loadSourceBranches = async () => {
      setIsLoadingSourceBranches(true);
      try {
        const result = await listGitBranches(
          selectedProjectBranchListWorkspaceId
            ? { workspaceId: selectedProjectBranchListWorkspaceId }
            : { workspaceWorktreePath: selectedProjectBranchListPath },
        );
        if (isCancelled) {
          return;
        }

        const nextGroups = resolveSourceBranchGroups({
          branches: result.branches ?? [],
          localBranches: result.localBranches,
          remoteBranches: result.remoteBranches,
          worktreeBranches: result.worktreeBranches,
        });
        applySourceBranchState(result.branches ?? [], nextGroups);
      } catch {
        if (isCancelled) {
          return;
        }
        applySourceBranchState([]);
      } finally {
        if (!isCancelled) {
          setIsLoadingSourceBranches(false);
        }
      }
    };

    void loadSourceBranches();

    return () => {
      isCancelled = true;
    };
  }, [
    listGitBranches,
    open,
    selectedProject?.defaultBranch,
    selectedProjectBranchListPath,
    selectedProjectBranchListWorkspaceId,
  ]);

  return {
    selectedProjectId,
    setSelectedProjectId,
    sourceBranchOptions,
    sourceBranchGroups,
    sourceBranch,
    setSourceBranch,
    sourceBranchMenuAnchorEl,
    setSourceBranchMenuAnchorEl,
    isLoadingSourceBranches,
    name,
    setName,
    targetBranch,
    setTargetBranch,
    hasEditedTargetBranchRef,
    isCreatingWorkspace,
    setIsCreatingWorkspace,
    resetDraftInputs,
    selectedProject,
    selectedProjectBranchListPath,
    defaultBranchPrefix,
    taskPrompt,
    setTaskPrompt,
    taskModel,
    setTaskModel,
  };
}
