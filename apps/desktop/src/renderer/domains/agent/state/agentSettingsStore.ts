import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { type DesktopAgentKind, createDefaultAgentInUseByKind, isDesktopAgentKind } from "../providers/agentSettings";

export const AGENT_SETTINGS_STORE_STORAGE_KEY = "yishan-agent-settings-store";

/** Yishan-owned default for fresh desktop chats; modelId is the exact Pi model ID, including any slashes. */
export type AgentDefaultModel = {
  provider: string;
  modelId: string;
};

/** Persisted desktop agent preferences and their mutation actions. */
export type AgentSettingsStoreState = {
  defaultModel?: AgentDefaultModel;
  setDefaultModel: (model: AgentDefaultModel | undefined) => void;
  inUseByAgentKind: Record<DesktopAgentKind, boolean>;
  setAgentInUse: (agentKind: DesktopAgentKind, inUse: boolean) => void;
};

type AgentSettingsStorePersistedState = {
  defaultModel?: AgentDefaultModel;
  inUseByAgentKind: Partial<Record<DesktopAgentKind, boolean>>;
};

/** Normalizes one persisted agent in-use map so all supported agents always have explicit booleans. */
function normalizeInUseByAgentKind(
  candidate: Partial<Record<DesktopAgentKind, boolean>> | undefined,
): Record<DesktopAgentKind, boolean> {
  const defaults = createDefaultAgentInUseByKind(true);
  if (!candidate) {
    return defaults;
  }

  for (const [rawAgentKind, rawInUseValue] of Object.entries(candidate)) {
    if (!isDesktopAgentKind(rawAgentKind)) {
      continue;
    }
    defaults[rawAgentKind] = typeof rawInUseValue === "boolean" ? rawInUseValue : true;
  }

  return defaults;
}

/** Rejects malformed persisted preferences without guessing a provider from a slash-containing model ID. */
function normalizeDefaultModel(candidate: unknown): AgentDefaultModel | undefined {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    !("provider" in candidate) ||
    !("modelId" in candidate) ||
    typeof candidate.provider !== "string" ||
    typeof candidate.modelId !== "string"
  ) {
    return undefined;
  }
  const provider = candidate.provider.trim();
  const modelId = candidate.modelId.trim();
  return provider && modelId ? { provider, modelId } : undefined;
}

/**
 * Stores persisted desktop-agent in-use preferences.
 * Custom launch commands and a default-agent selection are no longer supported
 * and are intentionally dropped during hydration.
 */
export const agentSettingsStore = create<AgentSettingsStoreState>()(
  persist(
    immer((set) => ({
      defaultModel: undefined,
      setDefaultModel: (model) => {
        set({ defaultModel: normalizeDefaultModel(model) });
      },
      inUseByAgentKind: createDefaultAgentInUseByKind(true),
      setAgentInUse: (agentKind, inUse) => {
        set((state) => {
          return {
            inUseByAgentKind: {
              ...state.inUseByAgentKind,
              [agentKind]: inUse,
            },
          };
        });
      },
    })),
    {
      name: AGENT_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): AgentSettingsStorePersistedState => ({
        inUseByAgentKind: state.inUseByAgentKind,
        defaultModel: state.defaultModel,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<AgentSettingsStorePersistedState>)
            : undefined;

        return {
          ...currentState,
          defaultModel: normalizeDefaultModel(persisted?.defaultModel),
          inUseByAgentKind: normalizeInUseByAgentKind(persisted?.inUseByAgentKind),
        };
      },
    },
  ),
);
