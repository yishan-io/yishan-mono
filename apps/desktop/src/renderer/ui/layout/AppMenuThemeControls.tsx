import { Button, ButtonGroup, Tooltip } from "@mui/material";
import type { IconType } from "react-icons";
import { LuLaptop, LuMoon, LuSun } from "react-icons/lu";
import type { AppThemePreference } from "../../theme";
import { themeButtonSx } from "./appMenuStyles";

const themeOptions: Array<{
  preference: AppThemePreference;
  title: string;
  ariaLabel: string;
  icon: IconType;
}> = [
  {
    preference: "system",
    title: "org.menu.theme.system",
    ariaLabel: "org.menu.theme.systemAria",
    icon: LuLaptop,
  },
  {
    preference: "light",
    title: "org.menu.theme.light",
    ariaLabel: "org.menu.theme.lightAria",
    icon: LuSun,
  },
  {
    preference: "dark",
    title: "org.menu.theme.dark",
    ariaLabel: "org.menu.theme.darkAria",
    icon: LuMoon,
  },
];

export interface AppMenuThemeControlsProps {
  themePreference: AppThemePreference;
  onChange: (preference: AppThemePreference) => void;
  translate: (key: string) => string;
}

/** Renders the horizontal app-theme selector used at the top of the app menu. */
export function AppMenuThemeControls({ themePreference, onChange, translate }: AppMenuThemeControlsProps) {
  return (
    <ButtonGroup
      size="small"
      fullWidth
      aria-label={translate("org.menu.theme.groupAria")}
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
          <Tooltip key={themeOption.preference} title={translate(themeOption.title)}>
            <Button
              aria-label={translate(themeOption.ariaLabel)}
              variant={themePreference === themeOption.preference ? "contained" : "outlined"}
              onClick={() => {
                onChange(themeOption.preference);
              }}
              sx={themeButtonSx}
            >
              <ThemeIcon size={14} />
            </Button>
          </Tooltip>
        );
      })}
    </ButtonGroup>
  );
}
