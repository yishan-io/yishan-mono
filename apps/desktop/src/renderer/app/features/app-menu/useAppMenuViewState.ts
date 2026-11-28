import { openExternalUrl } from "@renderer/domains/browser";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "../../../app/commands/appCommands";

/** Owns local app menu state and behavior while preserving the public AppMenuView API. */
export function useAppMenuViewState() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const isMenuOpen = Boolean(menuAnchor);

  const closeMenus = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  useEffect(() => {
    if (!location.pathname) {
      return;
    }

    closeMenus();
  }, [closeMenus, location.pathname]);

  const handleToggleMenu = useCallback((anchorElement: HTMLElement) => {
    setMenuAnchor((currentAnchor) => (currentAnchor === anchorElement ? null : anchorElement));
  }, []);

  const handleNavigateToSettings = useCallback(() => {
    navigate("/settings");
    setMenuAnchor(null);
  }, [navigate]);

  const handleNavigateToKeybindings = useCallback(() => {
    navigate("/settings?tab=keybindings");
    setMenuAnchor(null);
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await logout();
    closeMenus();
    navigate("/");
  }, [closeMenus, navigate]);

  const handleOpenExternalUrl = useCallback((url: string) => {
    // fire-and-forget: external browser open should not block menu interaction.
    void openExternalUrl(url).catch((error) => {
      console.warn("Failed to open external URL", error);
    });
    setMenuAnchor(null);
  }, []);

  return {
    menuAnchor,
    isMenuOpen,
    closeMenus,
    handleToggleMenu,
    handleNavigateToSettings,
    handleNavigateToKeybindings,
    handleLogout,
    handleOpenExternalUrl,
  };
}
