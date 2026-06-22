import {
  resolveWorkspaceSourceBranchState,
  suggestWorkspaceTargetBranchName,
  toWorkspaceBranchName,
} from "@yishan/core";

export const resolveSourceBranchState = resolveWorkspaceSourceBranchState;
export const suggestTargetBranchName = suggestWorkspaceTargetBranchName;
export const toBranchName = toWorkspaceBranchName;

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
