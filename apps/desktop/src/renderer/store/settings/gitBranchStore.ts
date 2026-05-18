import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createJSONStorage, persist } from "zustand/middleware";

export type GitBranchPrefixMode = "none" | "user" | "custom";

export const GIT_BRANCH_STORE_STORAGE_KEY = "yishan-git-branch-naming-store";
const DEFAULT_GIT_BRANCH_PREFIX_MODE: GitBranchPrefixMode = "none";

/**
 * Normalizes one free-text value into one git-safe branch segment.
 */
export function normalizeGitBranchPrefixSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

/**
 * Resolves one branch prefix segment from current prefix settings and git author.
 */
export function resolveGitBranchPrefix(input: {
  prefixMode: GitBranchPrefixMode;
  customPrefix: string;
  gitUserName: string;
}): string {
  if (input.prefixMode === "none") {
    return "";
  }
  if (input.prefixMode === "user") {
    return normalizeGitBranchPrefixSegment(input.gitUserName);
  }
  return normalizeGitBranchPrefixSegment(input.customPrefix);
}

/**
 * Normalizes one persisted prefix mode into one supported value.
 * Legacy `type` values are treated as `none`.
 */
function normalizeGitBranchPrefixMode(value: unknown): GitBranchPrefixMode {
  if (value === "user" || value === "custom") {
    return value;
  }
  return "none";
}

type GitBranchStoreState = {
  prefixMode: GitBranchPrefixMode;
  customPrefix: string;
  setPrefixMode: (prefixMode: GitBranchPrefixMode) => void;
  setCustomPrefix: (customPrefix: string) => void;
};

/** Stores persisted global git-branch naming preferences used during workspace branch creation. */
export const gitBranchStore = create<GitBranchStoreState>()(
  persist(
    immer((set) => ({
      prefixMode: DEFAULT_GIT_BRANCH_PREFIX_MODE,
      customPrefix: "",
      setPrefixMode: (prefixMode) => set({ prefixMode }),
      setCustomPrefix: (customPrefix) => set({ customPrefix }),
    })),
    {
      name: GIT_BRANCH_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as {
          prefixMode?: unknown;
          customPrefix?: unknown;
        };
        const prefixMode = normalizeGitBranchPrefixMode(persisted.prefixMode);
        const customPrefix = typeof persisted.customPrefix === "string" ? persisted.customPrefix : "";

        return {
          ...currentState,
          prefixMode,
          customPrefix,
        };
      },
      partialize: (state) => ({
        prefixMode: state.prefixMode,
        customPrefix: state.customPrefix,
      }),
    },
  ),
);
