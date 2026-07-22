import { Avatar, Button, IconButton } from "@mui/material";
import { LuMenu } from "react-icons/lu";

export interface AppMenuTriggerButtonProps {
  fullWidth?: boolean;
  iconOnly?: boolean;
  initials: string;
  isMenuOpen: boolean;
  triggerLabel: string;
  avatarUrl?: string;
  avatarAlt: string;
  onToggle: (anchorElement: HTMLElement) => void;
}

/** Renders the public app menu trigger in icon-only or labeled button mode. */
export function AppMenuTriggerButton({
  fullWidth = false,
  iconOnly = false,
  initials,
  isMenuOpen,
  triggerLabel,
  avatarUrl,
  avatarAlt,
  onToggle,
}: AppMenuTriggerButtonProps) {
  if (iconOnly) {
    return (
      <IconButton
        aria-label={triggerLabel}
        onClick={(event) => {
          onToggle(event.currentTarget);
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
          src={avatarUrl}
          alt={avatarAlt}
          variant="square"
          sx={{ width: 30, height: 30, bgcolor: "transparent", color: "text.secondary", fontSize: 11 }}
        >
          {initials}
        </Avatar>
      </IconButton>
    );
  }

  return (
    <Button
      size="small"
      variant="outlined"
      aria-expanded={isMenuOpen}
      onClick={(event) => {
        onToggle(event.currentTarget);
      }}
      startIcon={<LuMenu size={14} />}
      sx={{
        width: fullWidth ? "100%" : "auto",
        height: fullWidth ? 34 : 24,
        minHeight: fullWidth ? 34 : 24,
        minWidth: fullWidth ? "100%" : 0,
        px: 1,
        typography: "caption",

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
      {triggerLabel}
    </Button>
  );
}
