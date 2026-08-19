import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppThemePreference } from "./themePreference";

export const DISPLAY_SETTINGS_STORE_STORAGE_KEY = "yishan-display-settings-store";

export type LinkTarget = "built-in" | "external";
export type MarkdownThemePreference = "inherit" | "light" | "dark";
export type MarkdownPreviewFontSize = "small" | "medium" | "large";
export type MarkdownPreviewWidth = "readable" | "full";

export type DisplaySettingsState = {
  themePreference: AppThemePreference;
  markdownThemePreference: MarkdownThemePreference;
  markdownPreviewFontSize: MarkdownPreviewFontSize;
  markdownPreviewWidth: MarkdownPreviewWidth;
  isMarkdownOutlineVisible: boolean;
  linkTarget: LinkTarget;

  setThemePreference: (preference: AppThemePreference) => void;
  setMarkdownThemePreference: (preference: MarkdownThemePreference) => void;
  setMarkdownPreviewFontSize: (size: MarkdownPreviewFontSize) => void;
  setMarkdownPreviewWidth: (width: MarkdownPreviewWidth) => void;
  setIsMarkdownOutlineVisible: (visible: boolean) => void;
  setLinkTarget: (target: LinkTarget) => void;
};

/**
 * Stores persisted display preferences (theme, markdown preview, link-open
 * target). Moved from Workbench `layoutStore` (desktop6-adjust.md Target
 * State: Markdown, Theme, and Link preferences belong to Settings).
 */
export const displaySettingsStore = create<DisplaySettingsState>()(
  persist(
    (set) => ({
      themePreference: "system" as AppThemePreference,
      markdownThemePreference: "inherit" as MarkdownThemePreference,
      markdownPreviewFontSize: "medium" as MarkdownPreviewFontSize,
      markdownPreviewWidth: "readable" as MarkdownPreviewWidth,
      isMarkdownOutlineVisible: false,
      linkTarget: "built-in" as LinkTarget,

      setThemePreference: (themePreference) => {
        set({ themePreference });
      },
      setMarkdownThemePreference: (markdownThemePreference) => {
        set({ markdownThemePreference });
      },
      setMarkdownPreviewFontSize: (markdownPreviewFontSize) => {
        set({ markdownPreviewFontSize });
      },
      setMarkdownPreviewWidth: (markdownPreviewWidth) => {
        set({ markdownPreviewWidth });
      },
      setIsMarkdownOutlineVisible: (isMarkdownOutlineVisible) => {
        set({ isMarkdownOutlineVisible });
      },
      setLinkTarget: (linkTarget) => {
        set({ linkTarget });
      },
    }),
    {
      name: DISPLAY_SETTINGS_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
