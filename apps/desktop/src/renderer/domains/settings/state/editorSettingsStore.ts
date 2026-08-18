import { TYPOGRAPHY_TOKENS } from "@yishan-io/design-tokens";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { CODE_THEME_FAMILIES, type CodeThemeFamilyId } from "../../../helpers/codeThemes";

export const EDITOR_SETTINGS_STORE_STORAGE_KEY = "yishan-editor-settings-store";

export type CodeThemePreference = CodeThemeFamilyId;

export type EditorSettingsStoreState = {
  codeThemePreference: CodeThemePreference;
  editorFontSize: number;
  wordWrap: boolean;
  setCodeThemePreference: (codeThemePreference: CodeThemePreference) => void;
  setEditorFontSize: (editorFontSize: number) => void;
  setWordWrap: (wordWrap: boolean) => void;
};

type EditorSettingsStorePersistedState = {
  codeThemePreference: CodeThemePreference;
  editorFontSize: number;
  wordWrap: boolean;
};

function normalizeCodeThemePreference(value: unknown): CodeThemePreference {
  if (typeof value === "string") {
    const validIds: string[] = CODE_THEME_FAMILIES.map((f) => f.id);
    if (validIds.includes(value)) {
      return value as CodeThemePreference;
    }
  }
  return "yishan";
}

function normalizeEditorFontSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 13;
  }
  return Math.round(
    Math.max(TYPOGRAPHY_TOKENS.editorFontSizeMinPx, Math.min(TYPOGRAPHY_TOKENS.editorFontSizeMaxPx, value)),
  );
}

function normalizeWordWrap(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

/** Stores persisted editor-level preferences for code display. */
export const editorSettingsStore = create<EditorSettingsStoreState>()(
  persist(
    immer((set) => ({
      codeThemePreference: "yishan",
      editorFontSize: 13,
      wordWrap: true,
      setCodeThemePreference: (codeThemePreference) => {
        set({ codeThemePreference });
      },
      setEditorFontSize: (editorFontSize) => {
        set({ editorFontSize });
      },
      setWordWrap: (wordWrap) => {
        set({ wordWrap });
      },
    })),
    {
      name: EDITOR_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): EditorSettingsStorePersistedState => ({
        codeThemePreference: state.codeThemePreference,
        editorFontSize: state.editorFontSize,
        wordWrap: state.wordWrap,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<EditorSettingsStorePersistedState>)
            : undefined;
        return {
          ...currentState,
          codeThemePreference: normalizeCodeThemePreference(persisted?.codeThemePreference),
          editorFontSize: normalizeEditorFontSize(persisted?.editorFontSize),
          wordWrap: normalizeWordWrap(persisted?.wordWrap),
        };
      },
    },
  ),
);
