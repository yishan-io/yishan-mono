import type { BranchDropdownGroups } from "../../../components/BranchDropdown";

/** Deduplicates and sorts branch names with preferred branches (main, master) first. */
export function toUniqueSorted(values: string[]): string[] {
  const normalizedValues = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  const preferredBranchOrder = new Map<string, number>([
    ["main", 0],
    ["master", 1],
    ["origin/main", 0],
    ["origin/master", 1],
  ]);

  return normalizedValues.sort((left, right) => {
    const leftRank = preferredBranchOrder.get(left);
    const rightRank = preferredBranchOrder.get(right);
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }

    return left.localeCompare(right);
  });
}

/** Groups flat branch list into local, worktree, and remote categories. */
export function resolveSourceBranchGroups(input: {
  branches: string[];
  localBranches?: string[];
  remoteBranches?: string[];
  worktreeBranches?: string[];
}): BranchDropdownGroups {
  const hasExplicitGroups = Boolean(input.localBranches || input.remoteBranches || input.worktreeBranches);
  if (hasExplicitGroups) {
    return {
      localBranches: toUniqueSorted(input.localBranches ?? []),
      worktreeBranches: toUniqueSorted(input.worktreeBranches ?? []),
      remoteBranches: toUniqueSorted(input.remoteBranches ?? []),
    };
  }

  const localBranches: string[] = [];
  const worktreeBranches: string[] = [];
  const remoteBranches: string[] = [];

  for (const branch of input.branches) {
    const normalizedBranch = branch.trim();
    if (!normalizedBranch) {
      continue;
    }
    if (normalizedBranch.includes("/") && !normalizedBranch.startsWith("origin/")) {
      worktreeBranches.push(normalizedBranch);
      continue;
    }
    if (normalizedBranch.startsWith("origin/")) {
      remoteBranches.push(normalizedBranch);
      continue;
    }
    localBranches.push(normalizedBranch);
  }

  return {
    localBranches: toUniqueSorted(localBranches),
    worktreeBranches: toUniqueSorted(worktreeBranches),
    remoteBranches: toUniqueSorted(remoteBranches),
  };
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
