import { useEffect } from "react";
import { popupStore } from "../../app/state/popupStore";

export function useDialogRegistration(open: boolean): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    popupStore.getState().registerPopup();
    return () => {
      popupStore.getState().unregisterPopup();
    };
  }, [open]);
}
