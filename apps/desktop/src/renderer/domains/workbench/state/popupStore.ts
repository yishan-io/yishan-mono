import { create } from "zustand";

export type PopupStoreState = {
  popupCount: number;
  isPopupOpen: boolean;
  registerPopup: () => void;
  unregisterPopup: () => void;
};

/**
 * Tracks open popup/dialog count so global shortcuts pause while a popup is
 * open. Moved from Workbench `layoutStore` (desktop6-adjust.md Target State:
 * popup tracking belongs to the App, the owner of the popup lifecycle).
 */
export const popupStore = create<PopupStoreState>()((set) => ({
  popupCount: 0,
  isPopupOpen: false,
  registerPopup: () => {
    set((state) => {
      const nextCount = state.popupCount + 1;
      return { popupCount: nextCount, isPopupOpen: nextCount > 0 };
    });
  },
  unregisterPopup: () => {
    set((state) => {
      const nextCount = Math.max(0, state.popupCount - 1);
      return { popupCount: nextCount, isPopupOpen: nextCount > 0 };
    });
  },
}));
