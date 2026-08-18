import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { type DesktopAgentKind, createDefaultAgentInUseByKind, isDesktopAgentKind } from "../../../helpers/agentSettings";

export const AGENT_SETTINGS_STORE_STORAGE_KEY = "yishan-agent-settings-store";

type AgentSettingsStoreState = {
  inUseByAgentKind: Record<DesktopAgentKind, boolean>;
  setAgentInUse: (agentKind: DesktopAgentKind, inUse: boolean) => void;
};

type AgentSettingsStorePersistedState = {
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

/**
 * Stores persisted desktop-agent in-use preferences.
 * Custom launch commands and a default-agent selection are no longer supported
 * and are intentionally dropped during hydration.
 */
export const agentSettingsStore = create<AgentSettingsStoreState>()(
  persist(
    immer((set) => ({
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
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<AgentSettingsStorePersistedState>)
            : undefined;

        return {
          ...currentState,
          inUseByAgentKind: normalizeInUseByAgentKind(persisted?.inUseByAgentKind),
        };
      },
    },
  ),
);
