import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCommands } from "../../hooks/useCommands";

/** Owns local app menu state and behavior while preserving the public AppMenuView API. */
export function useAppMenuViewState() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, openExternalUrl, switchOrganization } = useCommands();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [organizationMenuAnchor, setOrganizationMenuAnchor] = useState<HTMLElement | null>(null);
  const [isCreateOrganizationDialogOpen, setIsCreateOrganizationDialogOpen] = useState(false);
  const isMenuOpen = Boolean(menuAnchor);
  const isOrganizationMenuOpen = Boolean(organizationMenuAnchor);

  const closeMenus = useCallback(() => {
    setMenuAnchor(null);
    setOrganizationMenuAnchor(null);
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

  const handleOpenOrganizations = useCallback((anchorElement: HTMLElement) => {
    setOrganizationMenuAnchor(anchorElement);
  }, []);

  const handleToggleOrganizations = useCallback((anchorElement: HTMLElement) => {
    setOrganizationMenuAnchor((currentAnchor) => (currentAnchor === anchorElement ? null : anchorElement));
  }, []);

  const handleCloseOrganizationMenu = useCallback(() => {
    setOrganizationMenuAnchor(null);
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
  }, [closeMenus, logout, navigate]);

  const handleOpenExternalUrl = useCallback(
    (url: string) => {
      // fire-and-forget: external browser open should not block menu interaction.
      void openExternalUrl(url).catch((error) => {
        console.warn("Failed to open external URL", error);
      });
      setMenuAnchor(null);
    },
    [openExternalUrl],
  );

  const handleSelectOrganization = useCallback(
    (organizationId: string, isSelected: boolean) => {
      if (isSelected) {
        closeMenus();
        return;
      }

      // fire-and-forget: org switch updates shared state outside this view.
      void switchOrganization(organizationId);
      closeMenus();
    },
    [closeMenus, switchOrganization],
  );

  const handleOpenCreateOrganizationDialog = useCallback(() => {
    setOrganizationMenuAnchor(null);
    setIsCreateOrganizationDialogOpen(true);
  }, []);

  const handleCloseCreateOrganizationDialog = useCallback(() => {
    setIsCreateOrganizationDialogOpen(false);
  }, []);

  return {
    menuAnchor,
    organizationMenuAnchor,
    isMenuOpen,
    isOrganizationMenuOpen,
    isCreateOrganizationDialogOpen,
    closeMenus,
    handleToggleMenu,
    handleOpenOrganizations,
    handleToggleOrganizations,
    handleCloseOrganizationMenu,
    handleNavigateToSettings,
    handleNavigateToKeybindings,
    handleLogout,
    handleOpenExternalUrl,
    handleSelectOrganization,
    handleOpenCreateOrganizationDialog,
    handleCloseCreateOrganizationDialog,
  };
}
