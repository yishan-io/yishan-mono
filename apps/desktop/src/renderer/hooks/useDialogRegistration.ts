import { useEffect } from "react";
import { layoutStore } from "../features/workbench/state/layoutStore";

export function useDialogRegistration(open: boolean): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    layoutStore.getState().registerPopup();
    return () => {
      layoutStore.getState().unregisterPopup();
    };
  }, [open]);
}
