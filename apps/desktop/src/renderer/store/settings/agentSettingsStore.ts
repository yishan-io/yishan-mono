import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  AGENT_COMMAND_MAX_LENGTH,
  type DesktopAgentKind,
  createDefaultAgentInUseByKind,
  isDesktopAgentKind,
} from "../../helpers/agentSettings";

export const AGENT_SETTINGS_STORE_STORAGE_KEY = "yishan-agent-settings-store";

type AgentSettingsStoreState = {
  inUseByAgentKind: Record<DesktopAgentKind, boolean>;
  defaultAgentKind?: DesktopAgentKind;
  /** User-defined custom launch command per agent. Absent key means "use system default". */
  customCommandByAgentKind: Partial<Record<DesktopAgentKind, string>>;
  setAgentInUse: (agentKind: DesktopAgentKind, inUse: boolean) => void;
  setDefaultAgentKind: (agentKind: DesktopAgentKind | undefined) => void;
  /**
   * Persists a custom launch command for one agent kind.
   * An empty or whitespace-only value is treated as a reset to the system default.
   * Silently ignores values that exceed `AGENT_COMMAND_MAX_LENGTH`.
   */
  setAgentCustomCommand: (agentKind: DesktopAgentKind, command: string) => void;
  /** Clears any custom command override for one agent kind, reverting to the system default. */
  resetAgentCustomCommand: (agentKind: DesktopAgentKind) => void;
};

type AgentSettingsStorePersistedState = {
  inUseByAgentKind: Partial<Record<DesktopAgentKind, boolean>>;
  defaultAgentKind?: DesktopAgentKind;
  customCommandByAgentKind: Partial<Record<DesktopAgentKind, string>>;
};

function normalizeDefaultAgentKind(
  candidate: DesktopAgentKind | undefined,
  inUseByAgentKind: Record<DesktopAgentKind, boolean>,
): DesktopAgentKind | undefined {
  if (!candidate || !isDesktopAgentKind(candidate)) {
    return undefined;
  }

  return inUseByAgentKind[candidate] ? candidate : undefined;
}

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
 * Normalizes one persisted custom-command map.
 * Entries for unknown agent kinds or values exceeding the length limit are dropped.
 */
function normalizeCustomCommandByAgentKind(
  candidate: Partial<Record<DesktopAgentKind, string>> | undefined,
): Partial<Record<DesktopAgentKind, string>> {
  if (!candidate || typeof candidate !== "object") {
    return {};
  }

  const result: Partial<Record<DesktopAgentKind, string>> = {};
  for (const [rawAgentKind, rawCommand] of Object.entries(candidate)) {
    if (!isDesktopAgentKind(rawAgentKind)) {
      continue;
    }
    if (typeof rawCommand !== "string") {
      continue;
    }
    const trimmed = rawCommand.trim();
    if (trimmed.length === 0 || trimmed.length > AGENT_COMMAND_MAX_LENGTH) {
      continue;
    }
    result[rawAgentKind] = trimmed;
  }
  return result;
}

/** Stores persisted desktop-agent in-use preferences and custom command overrides. */
export const agentSettingsStore = create<AgentSettingsStoreState>()(
  persist(
    immer((set) => ({
      inUseByAgentKind: createDefaultAgentInUseByKind(true),
      defaultAgentKind: undefined,
      customCommandByAgentKind: {},
      setAgentInUse: (agentKind, inUse) => {
        set((state) => {
          const nextInUseByAgentKind = {
            ...state.inUseByAgentKind,
            [agentKind]: inUse,
          };

          return {
            inUseByAgentKind: nextInUseByAgentKind,
            defaultAgentKind: normalizeDefaultAgentKind(state.defaultAgentKind, nextInUseByAgentKind),
          };
        });
      },
      setDefaultAgentKind: (agentKind) => {
        set((state) => ({
          defaultAgentKind: normalizeDefaultAgentKind(agentKind, state.inUseByAgentKind),
        }));
      },
      setAgentCustomCommand: (agentKind, command) => {
        const trimmed = command.trim();
        if (trimmed.length > AGENT_COMMAND_MAX_LENGTH) {
          return;
        }
        set((state) => {
          if (trimmed.length === 0) {
            // Treat empty string as a reset — remove the key.
            const next = { ...state.customCommandByAgentKind };
            delete next[agentKind];
            return { customCommandByAgentKind: next };
          }
          return {
            customCommandByAgentKind: {
              ...state.customCommandByAgentKind,
              [agentKind]: trimmed,
            },
          };
        });
      },
      resetAgentCustomCommand: (agentKind) => {
        set((state) => {
          const next = { ...state.customCommandByAgentKind };
          delete next[agentKind];
          return { customCommandByAgentKind: next };
        });
      },
    })),
    {
      name: AGENT_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): AgentSettingsStorePersistedState => ({
        inUseByAgentKind: state.inUseByAgentKind,
        defaultAgentKind: state.defaultAgentKind,
        customCommandByAgentKind: state.customCommandByAgentKind,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<AgentSettingsStorePersistedState>)
            : undefined;

        const normalizedInUseByAgentKind = normalizeInUseByAgentKind(persisted?.inUseByAgentKind);

        return {
          ...currentState,
          inUseByAgentKind: normalizedInUseByAgentKind,
          defaultAgentKind: normalizeDefaultAgentKind(persisted?.defaultAgentKind, normalizedInUseByAgentKind),
          customCommandByAgentKind: normalizeCustomCommandByAgentKind(persisted?.customCommandByAgentKind),
        };
      },
    },
  ),
);
