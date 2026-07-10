import { useEffect } from "react";

export function useShellDrawerAutoDismiss({
  dismissDrawer,
  isNavOpen,
  isScreenFocused,
  pathname,
}: {
  dismissDrawer: () => void;
  isNavOpen: boolean;
  isScreenFocused: boolean;
  pathname: string;
}) {
  useEffect(() => {
    if (!isScreenFocused) return;

    const shouldKeepDrawerOpen = pathname.startsWith("/profile");
    if (!pathname.startsWith("/shell") && !shouldKeepDrawerOpen && isNavOpen) {
      dismissDrawer();
    }
  }, [dismissDrawer, isNavOpen, isScreenFocused, pathname]);
}
