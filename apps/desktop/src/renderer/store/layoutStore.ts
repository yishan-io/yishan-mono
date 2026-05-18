import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { AppThemePreference } from "../theme";

export const LAYOUT_STORE_STORAGE_KEY = "yishan-layout-store";
export const DEFAULT_LEFT_WIDTH = 320;
export const DEFAULT_RIGHT_WIDTH = 400;

export type LinkTarget = "built-in" | "external";

type LayoutStoreState = {
  // ── persisted layout ───────────────────────────────────────────────────────
  leftWidth: number;
  rightWidth: number;
  themePreference: AppThemePreference;
  isLeftPaneManuallyHidden: boolean;
  isRightPaneManuallyHidden: boolean;
  // ── persisted link setting (from former linkSettingsStore) ─────────────────
  linkTarget: LinkTarget;
  // ── transient popup tracking (from former popupStore) ─────────────────────
  popupCount: number;
  isPopupOpen: boolean;

  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setThemePreference: (preference: AppThemePreference) => void;
  setIsLeftPaneManuallyHidden: (hidden: boolean) => void;
  setIsRightPaneManuallyHidden: (hidden: boolean) => void;
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
      isLeftPaneManuallyHidden: false,
      isRightPaneManuallyHidden: true,
      linkTarget: "built-in" as LinkTarget,
      popupCount: 0,
      isPopupOpen: false,

      setLeftWidth: (leftWidth) => {
        set({ leftWidth });
      },
      setRightWidth: (rightWidth) => {
        set({ rightWidth });
      },
      setThemePreference: (themePreference) => {
        set({ themePreference });
      },
      setIsLeftPaneManuallyHidden: (isLeftPaneManuallyHidden) => {
        set({ isLeftPaneManuallyHidden });
      },
      setIsRightPaneManuallyHidden: (isRightPaneManuallyHidden) => {
        set({ isRightPaneManuallyHidden });
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
        linkTarget: state.linkTarget,
      }),
    },
  ),
);
