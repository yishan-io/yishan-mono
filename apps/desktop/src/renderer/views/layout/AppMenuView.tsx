import { ClickAwayListener, Divider, Paper, Popper, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";
import { getRendererPlatform } from "../../helpers/platform";
import { useThemePreference } from "../../hooks/useThemePreference";
import { getShortcutDisplayLabelById } from "../../shortcuts/shortcutDisplay";
import { sessionStore } from "../../store/sessionStore";
import { AppMenuMainMenuSection } from "./AppMenuMainMenuSection";
import { AppMenuOrganizationSubmenu } from "./AppMenuOrganizationSubmenu";
import { AppMenuThemeControls } from "./AppMenuThemeControls";
import { AppMenuTriggerButton } from "./AppMenuTriggerButton";
import { CreateOrganizationDialogView } from "./CreateOrganizationDialogView";
import { useAppMenuViewState } from "./useAppMenuViewState";

export interface AppMenuViewProps {
  fullWidth?: boolean;
  iconOnly?: boolean;
}

/** Renders a compact app menu with horizontal theme controls and route actions. */
export function AppMenuView({ fullWidth = false, iconOnly = false }: AppMenuViewProps = {}) {
  const { themePreference, setThemePreference } = useThemePreference();
  const { t } = useTranslation();
  const currentUser = sessionStore((state) => state.currentUser);
  const organizations = sessionStore((state) => state.organizations);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const {
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
  } = useAppMenuViewState();
  const platform = getRendererPlatform();
  const settingsShortcutLabel = platform === "darwin" ? "⌘+," : "CTRL+,";
  const keybindingsShortcutLabel = getShortcutDisplayLabelById("open-keybindings", platform);
  const initials =
    currentUser?.name
      ?.split(" ")
      .map((segment) => segment[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";
  const triggerLabel = t("org.menu.trigger");
  const avatarAlt = currentUser?.name ?? currentUser?.email ?? triggerLabel;

  return (
    <>
      <AppMenuTriggerButton
        fullWidth={fullWidth}
        iconOnly={iconOnly}
        initials={initials}
        isMenuOpen={isMenuOpen}
        triggerLabel={triggerLabel}
        avatarUrl={currentUser?.avatarUrl ?? undefined}
        avatarAlt={avatarAlt}
        onToggle={handleToggleMenu}
      />
      <Popper open={isMenuOpen} anchorEl={menuAnchor} placement="bottom-end" sx={{ zIndex: 1300, mt: 0.5 }}>
        <ClickAwayListener onClickAway={closeMenus}>
          <Paper
            elevation={3}
            sx={{
              p: 1,
              minWidth: 168,
              maxWidth: 220,
              bgcolor: "background.default",
              border: (theme) => `1px solid ${theme.palette.divider}`,
              backgroundImage: "none",
            }}
          >
            <Stack spacing={1}>
              <AppMenuThemeControls themePreference={themePreference} onChange={setThemePreference} translate={t} />
              <Divider />
              <AppMenuMainMenuSection
                settingsShortcutLabel={settingsShortcutLabel}
                keybindingsShortcutLabel={keybindingsShortcutLabel}
                translate={t}
                onOpenOrganizations={handleOpenOrganizations}
                onToggleOrganizations={handleToggleOrganizations}
                onNavigateToSettings={handleNavigateToSettings}
                onOpenDocumentation={() => {
                  handleOpenExternalUrl("https://www.electronjs.org/docs/latest/");
                }}
                onNavigateToKeybindings={handleNavigateToKeybindings}
                onContactSupport={() => {
                  handleOpenExternalUrl("mailto:support@yishan.io");
                }}
                onLogout={() => {
                  void handleLogout();
                }}
              />
            </Stack>
          </Paper>
        </ClickAwayListener>
      </Popper>
      <AppMenuOrganizationSubmenu
        anchorElement={organizationMenuAnchor}
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        isOpen={isOrganizationMenuOpen}
        translate={t}
        onSelectOrganization={handleSelectOrganization}
        onOpenCreateOrganizationDialog={handleOpenCreateOrganizationDialog}
        onClose={handleCloseOrganizationMenu}
      />
      <CreateOrganizationDialogView
        open={isCreateOrganizationDialogOpen}
        onClose={handleCloseCreateOrganizationDialog}
      />
    </>
  );
}
