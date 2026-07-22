import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type AiChatModelSelection, normalizeAiChatModelSelection } from "../../helpers/aiChatSettings";

export const AI_CHAT_SETTINGS_STORE_STORAGE_KEY = "yishan-ai-chat-settings-store";

type AiChatSettingsStoreState = {
  defaultModel?: AiChatModelSelection;
  setDefaultModel: (selection: AiChatModelSelection | undefined) => void;
};

type AiChatSettingsPersistedState = {
  defaultModel?: AiChatModelSelection;
};

/** Stores preferences owned only by Desktop AI Chat. */
export const aiChatSettingsStore = create<AiChatSettingsStoreState>()(
  persist(
    (set) => ({
      defaultModel: undefined,
      setDefaultModel: (selection) => {
        set({
          defaultModel: selection ? normalizeAiChatModelSelection(selection) : undefined,
        });
      },
    }),
    {
      name: AI_CHAT_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): AiChatSettingsPersistedState => ({
        defaultModel: state.defaultModel,
      }),
      merge: (persistedState, currentState) => {
        const persisted = isRecord(persistedState)
          ? (persistedState as Partial<AiChatSettingsPersistedState>)
          : undefined;
        return {
          ...currentState,
          defaultModel: normalizeAiChatModelSelection(persisted?.defaultModel),
        };
      },
    },
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
