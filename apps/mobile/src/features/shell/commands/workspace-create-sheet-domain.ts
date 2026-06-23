import { type WorkspaceCreateNodeOption, suggestWorkspaceCreateBranchName } from "@/features/workspaces/create";
import type { CreateWorkspaceInput } from "@/features/workspaces/workspaces.api";
import type { WorkspaceGitBranchList } from "@/features/workspaces/workspaces.types";
import {
  type WorkspaceSourceBranchGroups,
  resolveWorkspaceSourceBranchGroups,
  resolveWorkspaceSourceBranchState,
} from "@yishan/core";

export type WorkspaceCreateDraft = {
  hasEditedTargetBranch: boolean;
  name: string;
  selectedNodeId: string;
  sourceBranch: string;
  targetBranch: string;
};

export type WorkspaceCreateSourceBranchGroups = WorkspaceSourceBranchGroups;

export function createEmptyWorkspaceCreateDraft(): WorkspaceCreateDraft {
  return {
    hasEditedTargetBranch: false,
    name: "",
    selectedNodeId: "",
    sourceBranch: "",
    targetBranch: "",
  };
}

export function resolveWorkspaceCreateSelectedNodeId(args: {
  currentNodeId: string | null;
  currentSelectedNodeId: string;
  nodeOptions: WorkspaceCreateNodeOption[];
}) {
  const { currentNodeId, currentSelectedNodeId, nodeOptions } = args;
  if (currentSelectedNodeId && nodeOptions.some((option) => option.nodeId === currentSelectedNodeId)) {
    return currentSelectedNodeId;
  }

  if (currentNodeId && nodeOptions.some((option) => option.nodeId === currentNodeId)) {
    return currentNodeId;
  }

  return nodeOptions[0]?.nodeId ?? "";
}

export function syncWorkspaceCreateSourceBranch(
  draft: WorkspaceCreateDraft,
  selectedNode: WorkspaceCreateNodeOption | null,
): WorkspaceCreateDraft {
  if (!selectedNode) {
    return draft.sourceBranch ? { ...draft, sourceBranch: "" } : draft;
  }

  return draft.sourceBranch === selectedNode.sourceBranch
    ? draft
    : { ...draft, sourceBranch: selectedNode.sourceBranch };
}

export function resolveWorkspaceCreateSourceBranchGroups(
  branchList: WorkspaceGitBranchList | null | undefined,
): WorkspaceCreateSourceBranchGroups {
  if (!branchList) {
    return {
      localBranches: [],
      remoteBranches: [],
      worktreeBranches: [],
    };
  }

  return resolveWorkspaceSourceBranchGroups({
    branches: branchList.branches,
    localBranches: branchList.localBranches,
    remoteBranches: branchList.remoteBranches,
    worktreeBranches: branchList.worktreeBranches,
  });
}

/** Returns source branches in the stable local/worktree/remote display order used by mobile. */
export function listWorkspaceCreateSourceBranches(groups: WorkspaceCreateSourceBranchGroups): string[] {
  return [...groups.localBranches, ...groups.worktreeBranches, ...groups.remoteBranches];
}

/** Resolves the preferred source branch for workspace creation using the shared branch ordering rules. */
export function resolvePreferredWorkspaceCreateSourceBranch(args: {
  branchList: WorkspaceGitBranchList | null | undefined;
  fallbackSourceBranch: string;
}): string {
  if (!args.branchList) {
    return args.fallbackSourceBranch.trim();
  }

  const groups = resolveWorkspaceCreateSourceBranchGroups(args.branchList);
  const remotePreferredBranch =
    groups.remoteBranches.find((branch) => branch === "origin/main" || branch === "origin/master") ?? "";
  if (remotePreferredBranch) {
    return remotePreferredBranch;
  }

  return resolveWorkspaceSourceBranchState(listWorkspaceCreateSourceBranches(groups), "").preferred;
}

export function syncWorkspaceCreateLoadedSourceBranch(
  draft: WorkspaceCreateDraft,
  args: {
    availableSourceBranches: string[];
    preferredSourceBranch: string;
  },
): WorkspaceCreateDraft {
  const normalizedCurrentSourceBranch = draft.sourceBranch.trim();
  if (args.availableSourceBranches.length === 0) {
    return draft;
  }

  if (normalizedCurrentSourceBranch && args.availableSourceBranches.includes(normalizedCurrentSourceBranch)) {
    return draft;
  }

  const fallbackSourceBranch = args.preferredSourceBranch || args.availableSourceBranches[0] || "";
  return draft.sourceBranch === fallbackSourceBranch ? draft : { ...draft, sourceBranch: fallbackSourceBranch };
}

export function syncWorkspaceCreateTargetBranch(draft: WorkspaceCreateDraft): WorkspaceCreateDraft {
  if (draft.hasEditedTargetBranch) {
    return draft;
  }

  const suggestedTargetBranch = suggestWorkspaceCreateBranchName(draft.name);
  return draft.targetBranch === suggestedTargetBranch ? draft : { ...draft, targetBranch: suggestedTargetBranch };
}

export function isWorkspaceCreateSubmitDisabled(args: {
  draft: WorkspaceCreateDraft;
  pending: boolean;
  projectPresent: boolean;
  selectedNode: WorkspaceCreateNodeOption | null;
}) {
  const { draft, pending, projectPresent, selectedNode } = args;
  return (
    pending ||
    !projectPresent ||
    !selectedNode ||
    !draft.name.trim() ||
    !draft.sourceBranch.trim() ||
    !draft.targetBranch.trim()
  );
}

export function buildCreateWorkspaceInput(
  draft: WorkspaceCreateDraft,
  selectedNode: WorkspaceCreateNodeOption,
): CreateWorkspaceInput {
  return {
    branch: draft.targetBranch.trim(),
    kind: "worktree",
    localPath: selectedNode.localPath,
    name: draft.name.trim(),
    nodeId: selectedNode.nodeId,
    sourceBranch: draft.sourceBranch.trim(),
  };
}
