import { useGitAuthorName } from "@renderer/domains/git";
import type { WorkspaceProjectRecord } from "@renderer/domains/project";
import { getErrorMessage } from "@shared/helpers/errorHelpers";
import { useEffect, useRef, useState } from "react";
import { listOrgNodes } from "../../../../domains/node";
import type { WorkspaceItem } from "../../../../domains/workspace/model/workspaceTypes";
import { resolveGitBranchPrefix } from "../../model/branchPrefix";
import type { GitBranchPrefixMode } from "../../model/branchPrefix";
import type { BranchDropdownGroups } from "./BranchDropdown";
import { resolveSourceBranchGroups } from "./createWorkspaceHelpers";
import {
  resolveSourceBranchState,
  resolveTargetBranchForCreate,
  suggestTargetBranchName,
} from "./workspaceBranchNaming";

type NodeOption = { id: string; name: string; scope: "private" | "shared"; canUse: boolean; isOnline?: boolean };

type UseCreateWorkspaceDialogStateInput = {
  open: boolean;
  projectId: string;
  organizationId: string | undefined;
  daemonId: string | undefined;
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
  selectedNodeId: string;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string>>;
  nodes: NodeOption[];
  nodesError: string;
  resetDraftInputs: () => void;
  selectedProject: WorkspaceProjectRecord | undefined;
  selectedProjectBranchListPath: string;
  defaultBranchPrefix: string;
  taskPrompt: string;
  setTaskPrompt: React.Dispatch<React.SetStateAction<string>>;
  taskModel: string;
  setTaskModel: React.Dispatch<React.SetStateAction<string>>;
};

/** Manages draft state, branch loading, node loading, and prefix-derived defaults for the workspace dialog. */
export function useCreateWorkspaceDialogState({
  open,
  projectId,
  organizationId,
  daemonId,
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
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [nodesError, setNodesError] = useState("");
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
    if (!open || !organizationId) {
      setNodes([]);
      setNodesError("");
      setSelectedNodeId("");
      return;
    }

    let isCancelled = false;
    const loadNodes = async () => {
      try {
        const listedNodes = await listOrgNodes(organizationId);
        if (isCancelled) {
          return;
        }
        setNodes(listedNodes);
        setNodesError("");
      } catch (error) {
        if (isCancelled) {
          return;
        }
        setNodes([]);
        setNodesError(getErrorMessage(error));
      }
    };

    void loadNodes();
    return () => {
      isCancelled = true;
    };
  }, [open, organizationId]);

  useEffect(() => {
    if (!open || !nodes || nodes.length === 0) {
      return;
    }
    setSelectedNodeId((currentNodeId) => {
      if (currentNodeId && nodes.some((node) => node.id === currentNodeId && node.canUse && node.isOnline)) {
        return currentNodeId;
      }
      const daemonNode = daemonId
        ? nodes.find((node) => node.id === daemonId && node.canUse && node.isOnline)
        : undefined;
      if (daemonNode) {
        return daemonNode.id;
      }
      const fallbackNode = nodes.find((node) => node.canUse && node.isOnline);
      return fallbackNode?.id ?? "";
    });
  }, [daemonId, nodes, open]);

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
    selectedNodeId,
    setSelectedNodeId,
    nodes,
    nodesError,
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
