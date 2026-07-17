import type { SxProps, Theme } from "@mui/material/styles";

/** Shared button styles for app menu actions and theme controls. */
export const themeButtonSx: SxProps<Theme> = {
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

/** Shared button styling for vertically stacked app menu items. */
export const menuItemButtonSx: SxProps<Theme> = {
  justifyContent: "flex-start",
  textTransform: "none",
  color: "text.secondary",
  "&:hover": {
    bgcolor: "action.hover",
  },
};
