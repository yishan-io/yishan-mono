import type { WorkspaceCreateSourceBranchGroups } from "@/features/shell/commands/workspace-create-sheet-domain";

export const WORKSPACE_CREATE_SOURCE_BRANCH_SECTION_KEYS = [
  "localBranches",
  "worktreeBranches",
  "remoteBranches",
] as const;

type WorkspaceCreateSourceBranchSectionKey = (typeof WORKSPACE_CREATE_SOURCE_BRANCH_SECTION_KEYS)[number];

export type WorkspaceCreateSourceBranchSectionLabels = Record<WorkspaceCreateSourceBranchSectionKey, string>;

export type WorkspaceCreateSourceBranchSection = {
  branches: string[];
  key: WorkspaceCreateSourceBranchSectionKey;
  label: string;
};

/**
 * Builds visible source-branch sections in the stable UI order used by the workspace create sheet.
 */
export function resolveWorkspaceCreateSourceBranchSections(
  groups: WorkspaceCreateSourceBranchGroups,
  labels: WorkspaceCreateSourceBranchSectionLabels,
): WorkspaceCreateSourceBranchSection[] {
  return WORKSPACE_CREATE_SOURCE_BRANCH_SECTION_KEYS.flatMap((key) => {
    const branches = groups[key];
    if (branches.length === 0) {
      return [];
    }

    return [{ branches, key, label: labels[key] }];
  });
}
