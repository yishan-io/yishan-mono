import { useEffect, useRef, useState } from "react";
import { api } from "../../../api";
import type { BranchDropdownGroups } from "../../../components/BranchDropdown";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import {
  resolveSourceBranchState,
  resolveTargetBranchForCreate,
  suggestTargetBranchName,
} from "../../../helpers/workspaceBranchNaming";
import { useGitAuthorName } from "../../../hooks/useGitAuthorName";
import { resolveGitBranchPrefix } from "../../../store/settings/workspaceSettingsStore";
import type { WorkspaceItem, WorkspaceProjectRecord } from "../../../store/types";
import { resolveSourceBranchGroups } from "./createWorkspaceHelpers";

type NodeOption = { id: string; name: string; scope: "private" | "shared"; canUse: boolean; isOnline?: boolean };

type UseCreateWorkspaceDialogStateInput = {
  open: boolean;
  projectId: string;
  workspaceId?: string;
  isRenameMode: boolean;
  organizationId: string | undefined;
  daemonId: string | undefined;
  projects: WorkspaceProjectRecord[];
  workspaces: WorkspaceItem[];
  prefixMode: string;
  customPrefix: string;
  listGitBranches: (input: { workspaceWorktreePath: string }) => Promise<{
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
  selectedWorkspace: WorkspaceItem | undefined;
  selectedProjectBranchListPath: string;
  defaultBranchPrefix: string;
};

/** Manages draft state, branch loading, node loading, and prefix-derived defaults for the workspace dialog. */
export function useCreateWorkspaceDialogState({
  open,
  projectId,
  workspaceId,
  isRenameMode,
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

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId && workspace.repoId === selectedProjectId && workspace.kind !== "local",
  );
  const selectedProjectBranchListPath =
    selectedProject?.localPath?.trim() || selectedProject?.path?.trim() || selectedProject?.worktreePath?.trim() || "";
  const gitAuthorNamePath = open && !isRenameMode && prefixMode === "user" ? selectedProjectBranchListPath : "";
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
    if (!open || isRenameMode || !organizationId) {
      setNodes([]);
      setNodesError("");
      setSelectedNodeId("");
      return;
    }

    let isCancelled = false;
    const loadNodes = async () => {
      try {
        const listedNodes = await api.node.listByOrg(organizationId);
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
  }, [isRenameMode, open, organizationId]);

  useEffect(() => {
    if (!open || isRenameMode || !nodes || nodes.length === 0) {
      return;
    }
    setSelectedNodeId((currentNodeId) => {
      if (currentNodeId && nodes.some((node) => node.id === currentNodeId && node.canUse && node.isOnline)) {
        return currentNodeId;
      }
      const daemonNode = daemonId ? nodes.find((node) => node.id === daemonId && node.canUse && node.isOnline) : undefined;
      if (daemonNode) {
        return daemonNode.id;
      }
      const fallbackNode = nodes.find((node) => node.canUse && node.isOnline);
      return fallbackNode?.id ?? "";
    });
  }, [daemonId, isRenameMode, nodes, open]);

  useEffect(() => {
    if (!open || hasEditedTargetBranchRef.current || isRenameMode) {
      return;
    }
    const nextTargetBranch = suggestTargetBranchName(name, defaultBranchPrefix);
    setTargetBranch((currentValue) => (currentValue === nextTargetBranch ? currentValue : nextTargetBranch));
  }, [defaultBranchPrefix, isRenameMode, name, open]);

  useEffect(() => {
    if (!open || !selectedProjectBranchListPath || isRenameMode) {
      const renameSourceBranch = selectedWorkspace?.sourceBranch?.trim() ?? "";
      if (isRenameMode && open) {
        setSourceBranchOptions(renameSourceBranch ? [renameSourceBranch] : []);
        setSourceBranchGroups({
          localBranches: renameSourceBranch ? [renameSourceBranch] : [],
          worktreeBranches: [],
          remoteBranches: [],
        });
        setSourceBranch(renameSourceBranch);
        setIsLoadingSourceBranches(false);
        return;
      }
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
        const result = await listGitBranches({ workspaceWorktreePath: selectedProjectBranchListPath });
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
    isRenameMode,
    listGitBranches,
    open,
    selectedProject?.defaultBranch,
    selectedProjectBranchListPath,
    selectedWorkspace?.sourceBranch,
  ]);

  useEffect(() => {
    if (!open || !isRenameMode) {
      return;
    }

    setName(selectedWorkspace?.name ?? "");
    setTargetBranch(selectedWorkspace?.branch ?? "");
  }, [isRenameMode, open, selectedWorkspace?.branch, selectedWorkspace?.name]);

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
    selectedWorkspace,
    selectedProjectBranchListPath,
    defaultBranchPrefix,
  };
}
