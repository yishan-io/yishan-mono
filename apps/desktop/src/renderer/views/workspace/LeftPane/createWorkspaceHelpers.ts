import { resolveWorkspaceSourceBranchGroups, sortWorkspaceBranchNames } from "@yishan/core";
import type { BranchDropdownGroups } from "../../../components/BranchDropdown";

/** Deduplicates and sorts branch names with preferred branches (main, master) first. */
export function toUniqueSorted(values: string[]): string[] {
  return sortWorkspaceBranchNames(values);
}

/** Groups flat branch list into local, worktree, and remote categories. */
export function resolveSourceBranchGroups(input: {
  branches: string[];
  localBranches?: string[];
  remoteBranches?: string[];
  worktreeBranches?: string[];
}): BranchDropdownGroups {
  return resolveWorkspaceSourceBranchGroups(input);
}

/** Compact select styles for the node/project pickers in the create workspace dialog. */
export const compactSelectSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 2.5,
    backgroundColor: "action.hover",
    minHeight: 36,
    "& fieldset": {
      borderColor: "transparent",
    },
    "&:hover fieldset": {
      borderColor: "transparent",
    },
    "&.Mui-focused fieldset": {
      borderColor: "divider",
    },
  },
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    py: 0.5,
    pr: 4,
  },
  "& .MuiSelect-icon": {
    right: 10,
    color: "text.secondary",
    fontSize: 18,
  },
};
