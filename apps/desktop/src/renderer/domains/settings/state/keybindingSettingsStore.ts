import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const KEYBINDING_SETTINGS_STORE_STORAGE_KEY = "yishan-keybinding-settings-store";

export type KeybindingOverrideMap = Record<string, string>;

type KeybindingSettingsStoreState = {
  overridesById: KeybindingOverrideMap;
  isCaptureActive: boolean;
  setOverride: (shortcutId: string, keys: string) => void;
  resetOverride: (shortcutId: string) => void;
  resetAllOverrides: () => void;
  setCaptureActive: (active: boolean) => void;
};

function normalizeOverridesById(input: unknown): KeybindingOverrideMap {
  if (!input || typeof input !== "object") {
    return {};
  }

  const normalized: KeybindingOverrideMap = {};
  for (const [shortcutId, keys] of Object.entries(input as Record<string, unknown>)) {
    if (typeof keys !== "string") {
      continue;
    }

    const trimmed = keys.trim();
    if (!trimmed) {
      continue;
    }

    normalized[shortcutId] = trimmed;
  }

  return normalized;
}

export const keybindingSettingsStore = create<KeybindingSettingsStoreState>()(
  persist(
    immer((set) => ({
      overridesById: {},
      isCaptureActive: false,

      setOverride: (shortcutId, keys) => {
        const trimmed = keys.trim();
        set((state) => {
          if (!trimmed) {
            delete state.overridesById[shortcutId];
            return;
          }

          state.overridesById[shortcutId] = trimmed;
        });
      },

      resetOverride: (shortcutId) => {
        set((state) => {
          delete state.overridesById[shortcutId];
        });
      },

      resetAllOverrides: () => {
        set((state) => {
          state.overridesById = {};
        });
      },

      setCaptureActive: (active) => {
        set({ isCaptureActive: active });
      },
    })),
    {
      name: KEYBINDING_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        overridesById: state.overridesById,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<KeybindingSettingsStoreState>)
            : undefined;

        return {
          ...currentState,
          overridesById: normalizeOverridesById(persisted?.overridesById),
        };
      },
    },
  ),
);
