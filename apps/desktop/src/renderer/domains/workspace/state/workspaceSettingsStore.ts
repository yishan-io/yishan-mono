import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  DEFAULT_GIT_BRANCH_PREFIX_MODE,
  type GitBranchPrefixMode,
  normalizeGitBranchPrefixSegment,
  resolveGitBranchPrefix,
} from "../branchPrefix";

export const WORKSPACE_SETTINGS_STORE_STORAGE_KEY = "yishan-workspace-settings-store";
const LEGACY_GIT_BRANCH_STORE_STORAGE_KEY = "yishan-git-branch-naming-store";

export {
  DEFAULT_GIT_BRANCH_PREFIX_MODE,
  type GitBranchPrefixMode,
  normalizeGitBranchPrefixSegment,
  resolveGitBranchPrefix,
} from "../branchPrefix";

export type WorkspaceSettingsStoreState = {
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
