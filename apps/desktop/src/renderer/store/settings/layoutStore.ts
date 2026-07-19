import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { AppThemePreference } from "../../theme";

export const LAYOUT_STORE_STORAGE_KEY = "yishan-layout-store";
export const DEFAULT_LEFT_WIDTH = 320;
export const DEFAULT_RIGHT_WIDTH = 400;

export type LinkTarget = "built-in" | "external";
export type MarkdownThemePreference = "inherit" | "light" | "dark";
export type MarkdownDefaultViewMode = "edit" | "preview" | "split";
export type MarkdownPreviewFontSize = "small" | "medium" | "large";
export type MarkdownPreviewWidth = "readable" | "full";

type LayoutStoreState = {
  // ── persisted layout ───────────────────────────────────────────────────────
  leftWidth: number;
  rightWidth: number;
  themePreference: AppThemePreference;
  markdownThemePreference: MarkdownThemePreference;
  markdownDefaultViewMode: MarkdownDefaultViewMode;
  markdownPreviewFontSize: MarkdownPreviewFontSize;
  markdownPreviewWidth: MarkdownPreviewWidth;
  isMarkdownOutlineVisible: boolean;
  isLeftPaneManuallyHidden: boolean;
  // ── persisted link setting (from former linkSettingsStore) ─────────────────
  linkTarget: LinkTarget;
  // ── transient popup tracking (from former popupStore) ─────────────────────
  popupCount: number;
  isPopupOpen: boolean;

  setLeftPaneWidth: (width: number) => void;
  setRightPaneWidth: (width: number) => void;
  setThemePreference: (preference: AppThemePreference) => void;
  setMarkdownThemePreference: (preference: MarkdownThemePreference) => void;
  setMarkdownDefaultViewMode: (mode: MarkdownDefaultViewMode) => void;
  setMarkdownPreviewFontSize: (size: MarkdownPreviewFontSize) => void;
  setMarkdownPreviewWidth: (width: MarkdownPreviewWidth) => void;
  setIsMarkdownOutlineVisible: (visible: boolean) => void;
  setIsLeftPaneManuallyHidden: (hidden: boolean) => void;
  setLinkTarget: (target: LinkTarget) => void;
  registerPopup: () => void;
  unregisterPopup: () => void;
};

/** Stores persisted desktop layout preferences, link-open setting, and popup tracking. */
export const layoutStore = create<LayoutStoreState>()(
  persist(
    immer((set) => ({
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      themePreference: "system",
      markdownThemePreference: "inherit" as MarkdownThemePreference,
      markdownDefaultViewMode: "split" as MarkdownDefaultViewMode,
      markdownPreviewFontSize: "medium" as MarkdownPreviewFontSize,
      markdownPreviewWidth: "readable" as MarkdownPreviewWidth,
      isMarkdownOutlineVisible: false,
      isLeftPaneManuallyHidden: false,
      linkTarget: "built-in" as LinkTarget,
      popupCount: 0,
      isPopupOpen: false,

      setLeftPaneWidth: (leftWidth) => {
        set({ leftWidth });
      },
      setRightPaneWidth: (rightWidth) => {
        set({ rightWidth });
      },
      setThemePreference: (themePreference) => {
        set({ themePreference });
      },
      setMarkdownThemePreference: (markdownThemePreference) => {
        set({ markdownThemePreference });
      },
      setMarkdownDefaultViewMode: (markdownDefaultViewMode) => {
        set({ markdownDefaultViewMode });
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
      setIsLeftPaneManuallyHidden: (isLeftPaneManuallyHidden) => {
        set({ isLeftPaneManuallyHidden });
      },
      setLinkTarget: (linkTarget) => {
        set({ linkTarget });
      },
      registerPopup: () => {
        set((state) => {
          const nextCount = state.popupCount + 1;
          state.popupCount = nextCount;
          state.isPopupOpen = nextCount > 0;
        });
      },
      unregisterPopup: () => {
        set((state) => {
          const nextCount = Math.max(0, state.popupCount - 1);
          state.popupCount = nextCount;
          state.isPopupOpen = nextCount > 0;
        });
      },
    })),
    {
      name: LAYOUT_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        leftWidth: state.leftWidth,
        rightWidth: state.rightWidth,
        themePreference: state.themePreference,
        markdownThemePreference: state.markdownThemePreference,
        markdownDefaultViewMode: state.markdownDefaultViewMode,
        markdownPreviewFontSize: state.markdownPreviewFontSize,
        markdownPreviewWidth: state.markdownPreviewWidth,
        isMarkdownOutlineVisible: state.isMarkdownOutlineVisible,
        linkTarget: state.linkTarget,
      }),
    },
  ),
);
