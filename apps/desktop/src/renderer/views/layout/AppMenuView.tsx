import {
  Avatar,
  Box,
  Button,
  ButtonGroup,
  ClickAwayListener,
  Divider,
  IconButton,
  Paper,
  Popper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import {
  LuBookOpen,
  LuBuilding2,
  LuCheck,
  LuChevronRight,
  LuKeyboard,
  LuLaptop,
  LuMail,
  LuMenu,
  LuMoon,
  LuSettings,
  LuSun,
} from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { loadWorkspaceFromBackend } from "../../commands/projectCommands";
import { useThemePreference } from "../../hooks/useThemePreference";
import { getRendererPlatform } from "../../helpers/platform";
import { rendererQueryClient } from "../../queryClient";
import { getShortcutDisplayLabelById } from "../../shortcuts/shortcutDisplay";
import { sessionStore } from "../../store/sessionStore";
import type { AppThemePreference } from "../../theme";

const themeButtonSx: SxProps<Theme> = {
  boxShadow: "none",
  "&:hover": {
    boxShadow: "none",
  },
  "&:active": {
    boxShadow: "none",
  },
  color: "text.secondary",
  borderColor: "divider",
  "&.MuiButton-contained": {
    bgcolor: "action.selected",
    color: "primary.main",
    boxShadow: "none",
  },
  "&.MuiButton-contained:hover": {
    bgcolor: "action.hover",
    boxShadow: "none",
  },
};

const themeOptions: Array<{
  preference: AppThemePreference;
  titleKey: string;
  ariaLabelKey: string;
  icon: IconType;
}> = [
  {
    preference: "system",
    titleKey: "org.menu.theme.system",
    ariaLabelKey: "org.menu.theme.systemAria",
    icon: LuLaptop,
  },
  {
    preference: "light",
    titleKey: "org.menu.theme.light",
    ariaLabelKey: "org.menu.theme.lightAria",
    icon: LuSun,
  },
  {
    preference: "dark",
    titleKey: "org.menu.theme.dark",
    ariaLabelKey: "org.menu.theme.darkAria",
    icon: LuMoon,
  },
];

const menuItemButtonSx: SxProps<Theme> = {
  justifyContent: "flex-start",
  textTransform: "none",
  color: "text.secondary",
};

/** Renders a compact app menu with horizontal theme controls and route actions. */
export function AppMenuView({ fullWidth = false, iconOnly = false }: { fullWidth?: boolean; iconOnly?: boolean } = {}) {
  const { themePreference, setThemePreference } = useThemePreference();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = sessionStore((state) => state.currentUser);
  const organizations = sessionStore((state) => state.organizations);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const setSelectedOrganizationId = sessionStore((state) => state.setSelectedOrganizationId);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [organizationMenuAnchor, setOrganizationMenuAnchor] = useState<HTMLElement | null>(null);
  const isMenuOpen = Boolean(menuAnchor);
  const isOrganizationMenuOpen = Boolean(organizationMenuAnchor);
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

  return (
    <>
      {iconOnly ? (
        <IconButton
          size="small"
          aria-label={t("org.menu.trigger")}
          onClick={(event) => {
            setMenuAnchor(isMenuOpen ? null : event.currentTarget);
          }}
          sx={{
            width: 34,
            height: 34,
            minWidth: 34,
            color: "text.secondary",
            border: 0,
            borderColor: "divider",
            borderRadius: 0,
            "&:hover": {
              borderColor: "divider",
              bgcolor: "action.hover",
            },
          }}
        >
          <Avatar
            src={currentUser?.avatarUrl ?? undefined}
            alt={currentUser?.name ?? currentUser?.email ?? t("org.menu.trigger")}
            sx={{ width: 22, height: 22, fontSize: 11 }}
          >
            {initials}
          </Avatar>
        </IconButton>
      ) : (
        <Button
          size="small"
          variant="outlined"
          onClick={(event) => {
            setMenuAnchor(isMenuOpen ? null : event.currentTarget);
          }}
          startIcon={<LuMenu size={14} />}
          sx={{
            width: fullWidth ? "100%" : "auto",
            height: fullWidth ? 34 : 24,
            minHeight: fullWidth ? 34 : 24,
            minWidth: fullWidth ? "100%" : 0,
            px: 1,
            typography: "caption",
            textTransform: "none",
            color: "text.secondary",
            borderColor: "divider",
            "&:hover": {
              borderColor: "divider",
              bgcolor: "action.hover",
            },
            "&:focus-visible": {
              borderColor: "divider",
            },
          }}
        >
          {t("org.menu.trigger")}
        </Button>
      )}
      <Popper open={isMenuOpen} anchorEl={menuAnchor} placement="bottom-end" sx={{ zIndex: 1300, mt: 0.5 }}>
        <ClickAwayListener
          onClickAway={() => {
            setMenuAnchor(null);
            setOrganizationMenuAnchor(null);
          }}
        >
          <Paper elevation={3} sx={{ p: 1, minWidth: 168, maxWidth: 220 }}>
            <Stack spacing={1}>
              <ButtonGroup
                size="small"
                fullWidth
                aria-label={t("org.menu.theme.groupAria")}
                disableElevation
                sx={{
                  boxShadow: "none",
                  "& .MuiButtonGroup-grouped": {
                    boxShadow: "none !important",
                  },
                }}
              >
                {themeOptions.map((themeOption) => {
                  const ThemeIcon = themeOption.icon;

                  return (
                    <Tooltip key={themeOption.preference} title={t(themeOption.titleKey)} arrow>
                      <Button
                        aria-label={t(themeOption.ariaLabelKey)}
                        variant={themePreference === themeOption.preference ? "contained" : "outlined"}
                        onClick={() => {
                          setThemePreference(themeOption.preference);
                        }}
                        sx={themeButtonSx}
                      >
                        <ThemeIcon size={14} />
                      </Button>
                    </Tooltip>
                  );
                })}
              </ButtonGroup>
              <Divider />
              <Box>
                <Button
                  size="small"
                  fullWidth
                  startIcon={<LuBuilding2 size={14} />}
                  sx={menuItemButtonSx}
                  onClick={(event) => {
                    setOrganizationMenuAnchor((currentAnchor) =>
                      currentAnchor && currentAnchor === event.currentTarget ? null : event.currentTarget,
                    );
                  }}
                >
                  <Box
                    component="span"
                    sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                  >
                    <span>{t("org.menu.organizations")}</span>
                    <LuChevronRight size={14} aria-hidden="true" />
                  </Box>
                </Button>
                <Button
                  size="small"
                  fullWidth
                  startIcon={<LuSettings size={14} />}
                  sx={menuItemButtonSx}
                  onClick={() => {
                    navigate("/settings");
                    setMenuAnchor(null);
                  }}
                >
                  <Box
                    component="span"
                    sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                  >
                    <span>{t("org.menu.settings")}</span>
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
                  onClick={() => {
                    window.open("https://www.electronjs.org/docs/latest/", "_blank", "noopener,noreferrer");
                    setMenuAnchor(null);
                  }}
                >
                  {t("org.menu.documentation")}
                </Button>
                <Button
                  size="small"
                  fullWidth
                  startIcon={<LuKeyboard size={14} />}
                  sx={menuItemButtonSx}
                  onClick={() => {
                    navigate("/keybindings");
                    setMenuAnchor(null);
                  }}
                >
                  <Box
                    component="span"
                    sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                  >
                    <span>{t("org.menu.shortcutMap")}</span>
                    {keybindingsShortcutLabel ? (
                      <Typography variant="caption" color="text.secondary" component="span" aria-hidden="true">
                        {keybindingsShortcutLabel}
                      </Typography>
                    ) : null}
                  </Box>
                </Button>
                <Button
                  size="small"
                  fullWidth
                  startIcon={<LuMail size={14} />}
                  sx={menuItemButtonSx}
                  onClick={() => {
                    window.open("mailto:support@vestin.io", "_blank", "noopener,noreferrer");
                    setMenuAnchor(null);
                  }}
                >
                  {t("org.menu.contactUs")}
                </Button>
              </Box>
            </Stack>
          </Paper>
        </ClickAwayListener>
      </Popper>
      <Popper
        open={isOrganizationMenuOpen}
        anchorEl={organizationMenuAnchor}
        placement="right-start"
        disablePortal
        sx={{ zIndex: 1301, ml: 0.5 }}
      >
        <Paper elevation={3} sx={{ p: 0.75, minWidth: 220 }}>
          <Stack spacing={0.25}>
            {organizations.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.75 }}>
                {t("org.menu.noOrganizations")}
              </Typography>
            ) : (
              organizations.map((organization) => {
                const selected = organization.id === selectedOrganizationId;

                return (
                  <Button
                    key={organization.id}
                    size="small"
                    fullWidth
                    disabled={selected}
                    sx={{
                      justifyContent: "space-between",
                      textTransform: "none",
                      color: "text.secondary",
                      bgcolor: selected ? "action.selected" : "transparent",
                    }}
                    onClick={() => {
                      if (selected) {
                        return;
                      }
                      setSelectedOrganizationId(organization.id);
                      setOrganizationMenuAnchor(null);
                      setMenuAnchor(null);
                      void rendererQueryClient.invalidateQueries({ queryKey: ["org-project-snapshot"] });
                      void loadWorkspaceFromBackend();
                    }}
                  >
                    <span>{organization.name}</span>
                    {selected ? <LuCheck size={14} /> : null}
                  </Button>
                );
              })
            )}
          </Stack>
        </Paper>
      </Popper>
    </>
  );
}
