/**
 * Resolves source-branch options and default selection.
 * Prefers `main/master` when available, but uses `repoDefaultBranch` when branch data is unavailable.
 */
export function resolveSourceBranchState(
  branches: string[],
  repoDefaultBranch: string,
): { options: string[]; preferred: string } {
  const uniqueBranches = Array.from(new Set(branches.map((branch) => branch.trim()).filter(Boolean)));
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
 * Normalizes one branch candidate into a git-branch-friendly name.
 */
export function toBranchName(value: string): string {
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
 * Returns one suggested branch name from workspace name and configured prefix.
 */
export function suggestTargetBranchName(workspaceName: string, branchPrefix: string): string {
  const normalizedWorkspaceName = workspaceName.trim();
  if (!normalizedWorkspaceName) {
    return branchPrefix;
  }

  return toBranchName(`${branchPrefix}${normalizedWorkspaceName}`);
}

/**
 * Returns true when branch input is only the configured prefix placeholder.
 */
export function isPrefixOnlyBranchName(branchName: string, branchPrefix: string): boolean {
  const normalizedBranchName = branchName.trim();
  const normalizedBranchPrefix = branchPrefix.trim();
  if (!normalizedBranchPrefix) {
    return false;
  }

  return (
    normalizedBranchName === normalizedBranchPrefix ||
    normalizedBranchName === normalizedBranchPrefix.replace(/\/+$/g, "")
  );
}

/**
 * Resolves the final branch name used for workspace creation.
 * Manual non-prefix branch values win; otherwise derives from workspace name and prefix.
 */
export function resolveTargetBranchForCreate(input: {
  workspaceName: string;
  branchInput: string;
  branchPrefix: string;
}): string {
  const normalizedWorkspaceName = input.workspaceName.trim();
  if (!normalizedWorkspaceName) {
    return "";
  }

  const normalizedBranchInput = input.branchInput.trim();
  const hasManualNonPrefixBranch =
    normalizedBranchInput.length > 0 && !isPrefixOnlyBranchName(normalizedBranchInput, input.branchPrefix);
  return hasManualNonPrefixBranch
    ? normalizedBranchInput
    : suggestTargetBranchName(normalizedWorkspaceName, input.branchPrefix);
}
