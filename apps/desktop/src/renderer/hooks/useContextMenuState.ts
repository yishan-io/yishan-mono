import { useCallback, useState } from "react";

/** Manages one single-level context-menu state with stable open/close handlers. */
export function useContextMenuState<TMenuState>() {
  const [menu, setMenu] = useState<TMenuState | null>(null);

  const openMenu = useCallback((value: TMenuState) => {
    setMenu(value);
  }, []);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  return {
    menu,
    openMenu,
    closeMenu,
    isOpen: Boolean(menu),
  };
}
