import { Box, Button, Divider, Typography } from "@mui/material";
import { LuBookOpen, LuBuilding2, LuChevronRight, LuKeyboard, LuLogOut, LuMail, LuSettings } from "react-icons/lu";
import { menuItemButtonSx } from "./appMenuStyles";

const menuItemLabelRowSx = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 1,
} as const;

export interface AppMenuMainMenuSectionProps {
  settingsShortcutLabel: string;
  keybindingsShortcutLabel: string | null;
  translate: (key: string) => string;
  onOpenOrganizations: (anchorElement: HTMLElement) => void;
  onToggleOrganizations: (anchorElement: HTMLElement) => void;
  onNavigateToSettings: () => void;
  onOpenDocumentation: () => void;
  onNavigateToKeybindings: () => void;
  onContactSupport: () => void;
  onLogout: () => void;
}

/** Renders primary app menu actions and routes. */
export function AppMenuMainMenuSection({
  settingsShortcutLabel,
  keybindingsShortcutLabel,
  translate,
  onOpenOrganizations,
  onToggleOrganizations,
  onNavigateToSettings,
  onOpenDocumentation,
  onNavigateToKeybindings,
  onContactSupport,
  onLogout,
}: AppMenuMainMenuSectionProps) {
  return (
    <Box>
      <Button
        size="small"
        fullWidth
        startIcon={<LuBuilding2 size={14} />}
        sx={menuItemButtonSx}
        onMouseEnter={(event) => {
          onOpenOrganizations(event.currentTarget);
        }}
        onClick={(event) => {
          onToggleOrganizations(event.currentTarget);
        }}
      >
        <Box component="span" sx={menuItemLabelRowSx}>
          <Typography component="span" variant="body2">
            {translate("org.menu.organizations")}
          </Typography>
          <LuChevronRight size={14} aria-hidden="true" />
        </Box>
      </Button>
      <Button
        size="small"
        fullWidth
        startIcon={<LuSettings size={14} />}
        sx={menuItemButtonSx}
        onClick={onNavigateToSettings}
      >
        <Box component="span" sx={menuItemLabelRowSx}>
          <Typography component="span" variant="body2">
            {translate("org.menu.settings")}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="span" aria-hidden="true">
            {settingsShortcutLabel}
          </Typography>
        </Box>
      </Button>
      <Divider />
      <Button
        size="small"
        fullWidth
        startIcon={<LuBookOpen size={14} />}
        sx={menuItemButtonSx}
        onClick={onOpenDocumentation}
      >
        {translate("org.menu.documentation")}
      </Button>
      <Button
        size="small"
        fullWidth
        startIcon={<LuKeyboard size={14} />}
        sx={menuItemButtonSx}
        onClick={onNavigateToKeybindings}
      >
        <Box component="span" sx={menuItemLabelRowSx}>
          <Typography component="span" variant="body2">
            {translate("org.menu.shortcutMap")}
          </Typography>
          {keybindingsShortcutLabel ? (
            <Typography variant="caption" color="text.secondary" component="span" aria-hidden="true">
              {keybindingsShortcutLabel}
            </Typography>
          ) : null}
        </Box>
      </Button>
      <Button size="small" fullWidth startIcon={<LuMail size={14} />} sx={menuItemButtonSx} onClick={onContactSupport}>
        {translate("org.menu.contactUs")}
      </Button>
      <Divider />
      <Button size="small" fullWidth startIcon={<LuLogOut size={14} />} sx={menuItemButtonSx} onClick={onLogout}>
        Logout
      </Button>
    </Box>
  );
}
