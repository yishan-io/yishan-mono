import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type AiChatModelSelection,
  normalizeAiChatModelSelection,
  parseAiChatModelSelection,
} from "../../helpers/aiChatSettings";

export const AI_CHAT_SETTINGS_STORE_STORAGE_KEY = "yishan-ai-chat-settings-store";
const LEGACY_AGENT_SETTINGS_STORE_STORAGE_KEY = "yishan-agent-settings-store";

type AiChatSettingsStoreState = {
  defaultModel?: AiChatModelSelection;
  legacyMigrationCompleted: boolean;
  setDefaultModel: (selection: AiChatModelSelection | undefined) => void;
};

type AiChatSettingsPersistedState = {
  defaultModel?: AiChatModelSelection;
  legacyMigrationCompleted: boolean;
};

/** Stores preferences owned only by Desktop AI Chat. */
export const aiChatSettingsStore = create<AiChatSettingsStoreState>()(
  persist(
    (set) => ({
      defaultModel: undefined,
      legacyMigrationCompleted: false,
      setDefaultModel: (selection) => {
        set({
          defaultModel: selection ? normalizeAiChatModelSelection(selection) : undefined,
          legacyMigrationCompleted: true,
        });
      },
    }),
    {
      name: AI_CHAT_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): AiChatSettingsPersistedState => ({
        defaultModel: state.defaultModel,
        legacyMigrationCompleted: state.legacyMigrationCompleted,
      }),
      merge: (persistedState, currentState) => {
        const persisted = isRecord(persistedState)
          ? (persistedState as Partial<AiChatSettingsPersistedState>)
          : undefined;
        const legacyMigrationCompleted = persisted?.legacyMigrationCompleted === true;
        const persistedDefault = normalizeAiChatModelSelection(persisted?.defaultModel);
        return {
          ...currentState,
          defaultModel:
            persistedDefault ?? (legacyMigrationCompleted ? undefined : readLegacyDefaultAiChatModelSelection()),
          legacyMigrationCompleted: true,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (!error && state) {
          state.setDefaultModel(state.defaultModel);
        }
      },
    },
  ),
);

function readLegacyDefaultAiChatModelSelection(): AiChatModelSelection | undefined {
  try {
    const rawValue = localStorage.getItem(LEGACY_AGENT_SETTINGS_STORE_STORAGE_KEY);
    if (!rawValue) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(rawValue);
    if (!isRecord(parsed) || !isRecord(parsed.state)) {
      return undefined;
    }
    return parseAiChatModelSelection(parsed.state.defaultPiModelPattern);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
