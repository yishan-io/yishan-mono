import type { Theme } from "@mui/material/styles";

/**
 * Returns the MUI `sx` object for a left-pane `ListItemButton`.
 * Applies themed hover/selected rgba overrides consistent across
 * `ProjectRow` and `WorkspaceRow`.
 */
export function buildListItemButtonSx(theme: Theme) {
  return {
    bgcolor: "transparent",
    "&:hover, &:focus-visible": {
      bgcolor: theme.palette.mode === "dark" ? theme.palette.action.hover : "rgba(47, 122, 100, 0.1)",
    },
    "&.Mui-selected": {
      bgcolor: theme.palette.mode === "dark" ? theme.palette.action.selected : "rgba(211, 134, 17, 0.14)",
    },
    "&.Mui-selected:hover, &.Mui-selected:focus-visible": {
      bgcolor: theme.palette.mode === "dark" ? theme.palette.action.hover : "rgba(211, 134, 17, 0.2)",
    },
  } as const;
}
