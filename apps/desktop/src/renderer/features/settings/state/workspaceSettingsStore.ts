import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const WORKSPACE_SETTINGS_STORE_STORAGE_KEY = "yishan-workspace-settings-store";
const LEGACY_GIT_BRANCH_STORE_STORAGE_KEY = "yishan-git-branch-naming-store";

export type GitBranchPrefixMode = "none" | "user" | "custom";
const DEFAULT_GIT_BRANCH_PREFIX_MODE: GitBranchPrefixMode = "none";

type WorkspaceSettingsStoreState = {
  isDefaultContextEnabled: boolean;
  prefixMode: GitBranchPrefixMode;
  customPrefix: string;
  setDefaultContextEnabled: (isDefaultContextEnabled: boolean) => void;
  setPrefixMode: (prefixMode: GitBranchPrefixMode) => void;
  setCustomPrefix: (customPrefix: string) => void;
};

type WorkspaceSettingsStorePersistedState = {
  isDefaultContextEnabled: boolean;
  prefixMode: GitBranchPrefixMode;
  customPrefix: string;
};

function normalizeDefaultContextEnabled(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

/** Normalizes one free-text value into one git-safe branch segment. */
export function normalizeGitBranchPrefixSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

/** Resolves one branch prefix segment from current prefix settings and git author. */
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

function normalizeGitBranchPrefixMode(value: unknown): GitBranchPrefixMode {
  if (value === "user" || value === "custom") {
    return value;
  }
  return "none";
}

function readLegacyGitBranchSettings(): Partial<
  Pick<WorkspaceSettingsStorePersistedState, "prefixMode" | "customPrefix">
> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(LEGACY_GIT_BRANCH_STORE_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        prefixMode?: unknown;
        customPrefix?: unknown;
      };
    };
    return {
      prefixMode: normalizeGitBranchPrefixMode(parsed.state?.prefixMode),
      customPrefix: typeof parsed.state?.customPrefix === "string" ? parsed.state.customPrefix : "",
    };
  } catch {
    return {};
  }
}

/** Stores persisted workspace-level preferences used when creating and managing workspaces. */
export const workspaceSettingsStore = create<WorkspaceSettingsStoreState>()(
  persist(
    immer((set) => ({
      isDefaultContextEnabled: true,
      prefixMode: DEFAULT_GIT_BRANCH_PREFIX_MODE,
      customPrefix: "",
      setDefaultContextEnabled: (isDefaultContextEnabled) => {
        set({ isDefaultContextEnabled });
      },
      setPrefixMode: (prefixMode) => {
        set({ prefixMode });
      },
      setCustomPrefix: (customPrefix) => {
        set({ customPrefix });
      },
    })),
    {
      name: WORKSPACE_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): WorkspaceSettingsStorePersistedState => ({
        isDefaultContextEnabled: state.isDefaultContextEnabled,
        prefixMode: state.prefixMode,
        customPrefix: state.customPrefix,
      }),
      merge: (persistedState, currentState) => {
        const legacyGitBranchSettings = readLegacyGitBranchSettings();
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<WorkspaceSettingsStorePersistedState>)
            : undefined;
        return {
          ...currentState,
          isDefaultContextEnabled: normalizeDefaultContextEnabled(persisted?.isDefaultContextEnabled),
          prefixMode: normalizeGitBranchPrefixMode(persisted?.prefixMode ?? legacyGitBranchSettings.prefixMode),
          customPrefix:
            typeof persisted?.customPrefix === "string"
              ? persisted.customPrefix
              : typeof legacyGitBranchSettings.customPrefix === "string"
                ? legacyGitBranchSettings.customPrefix
                : "",
        };
      },
    },
  ),
);
