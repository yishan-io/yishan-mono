import type { WorkspaceGitBranchList } from "./workspace";

export type WorkspaceSourceBranchGroups = {
  localBranches: string[];
  remoteBranches: string[];
  worktreeBranches: string[];
};

const PREFERRED_SOURCE_BRANCH_ORDER = new Map<string, number>([
  ["main", 0],
  ["master", 1],
  ["origin/main", 0],
  ["origin/master", 1],
]);

function normalizeBranchNames(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/**
 * Deduplicates and sorts branch names with preferred main/master branches first.
 */
export function sortWorkspaceBranchNames(values: string[]): string[] {
  return normalizeBranchNames(values).sort((left, right) => {
    const leftRank = PREFERRED_SOURCE_BRANCH_ORDER.get(left);
    const rightRank = PREFERRED_SOURCE_BRANCH_ORDER.get(right);
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }

    return left.localeCompare(right);
  });
}

/**
 * Groups flat branch lists into local, worktree, and remote sections.
 */
export function resolveWorkspaceSourceBranchGroups(input: {
  branches: string[];
  localBranches?: string[];
  remoteBranches?: string[];
  worktreeBranches?: string[];
}): WorkspaceSourceBranchGroups {
  const hasExplicitGroups = Boolean(input.localBranches || input.remoteBranches || input.worktreeBranches);
  if (hasExplicitGroups) {
    return {
      localBranches: sortWorkspaceBranchNames(input.localBranches ?? []),
      remoteBranches: sortWorkspaceBranchNames(input.remoteBranches ?? []),
      worktreeBranches: sortWorkspaceBranchNames(input.worktreeBranches ?? []),
    };
  }

  const localBranches: string[] = [];
  const remoteBranches: string[] = [];
  const worktreeBranches: string[] = [];

  for (const branch of input.branches) {
    const normalizedBranch = branch.trim();
    if (!normalizedBranch) {
      continue;
    }

    if (normalizedBranch.startsWith("origin/")) {
      remoteBranches.push(normalizedBranch);
      continue;
    }

    if (normalizedBranch.includes("/")) {
      worktreeBranches.push(normalizedBranch);
      continue;
    }

    localBranches.push(normalizedBranch);
  }

  return {
    localBranches: sortWorkspaceBranchNames(localBranches),
    remoteBranches: sortWorkspaceBranchNames(remoteBranches),
    worktreeBranches: sortWorkspaceBranchNames(worktreeBranches),
  };
}

/**
 * Flattens grouped branch sections into the stable local/worktree/remote display order.
 */
export function listWorkspaceSourceBranches(groups: WorkspaceSourceBranchGroups): string[] {
  return [...groups.localBranches, ...groups.worktreeBranches, ...groups.remoteBranches];
}

/**
 * Resolves source-branch options and default selection.
 * Prefers `main/master` when available, but falls back to `repoDefaultBranch` when branch data is unavailable.
 */
export function resolveWorkspaceSourceBranchState(
  branches: string[],
  repoDefaultBranch: string,
): { options: string[]; preferred: string } {
  const uniqueBranches = normalizeBranchNames(branches);
  const normalizedRepoDefaultBranch = repoDefaultBranch.trim();
  const primaryBranch = normalizedRepoDefaultBranch === "master" ? "master" : "main";
  const secondaryBranch = primaryBranch === "main" ? "master" : "main";
  if (uniqueBranches.length === 0) {
    const fallbackBranch = normalizedRepoDefaultBranch || primaryBranch;
    return {
      options: [fallbackBranch],
      preferred: fallbackBranch,
    };
  }

  const preferredCandidates = [primaryBranch, secondaryBranch, normalizedRepoDefaultBranch];
  const preferred =
    preferredCandidates.find((candidate) => candidate && uniqueBranches.includes(candidate)) ?? uniqueBranches[0] ?? "";

  return {
    options: uniqueBranches,
    preferred,
  };
}

/**
 * Resolves the preferred source branch using the desktop ordering rules.
 */
export function resolvePreferredWorkspaceSourceBranch(args: {
  branchList: WorkspaceGitBranchList | null | undefined;
  repoDefaultBranch?: string;
}): string {
  const groups = resolveWorkspaceSourceBranchGroups({
    branches: args.branchList?.branches ?? [],
    localBranches: args.branchList?.localBranches,
    remoteBranches: args.branchList?.remoteBranches,
    worktreeBranches: args.branchList?.worktreeBranches,
  });
  const remotePreferredBranch =
    groups.remoteBranches.find((branch) => branch === "origin/main" || branch === "origin/master") ?? "";
  if (remotePreferredBranch) {
    return remotePreferredBranch;
  }

  return resolveWorkspaceSourceBranchState(listWorkspaceSourceBranches(groups), args.repoDefaultBranch ?? "").preferred;
}

/**
 * Normalizes one branch candidate into a git-branch-friendly name.
 */
export function toWorkspaceBranchName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, 64)
    .replace(/[-/]+$/g, "");
}

/**
 * Returns one suggested branch name from workspace name and optional prefix.
 */
export function suggestWorkspaceTargetBranchName(workspaceName: string, branchPrefix = ""): string {
  const normalizedWorkspaceName = workspaceName.trim();
  if (!normalizedWorkspaceName) {
    return branchPrefix;
  }

  return toWorkspaceBranchName(`${branchPrefix}${normalizedWorkspaceName}`);
}
