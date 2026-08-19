import { useEffect } from "react";

/** Suppresses host-native context menu while one custom menu (or submenu) is open. */
export function useSuppressNativeContextMenuWhileOpen(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowContextMenuCapture = (event: globalThis.MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", handleWindowContextMenuCapture, true);
    return () => {
      window.removeEventListener("contextmenu", handleWindowContextMenuCapture, true);
    };
  }, [isOpen]);
}
