import { IconButton, Tooltip } from "@mui/material";
import type { ReactNode } from "react";

export type PaneToggleButtonProps = {
  /** Tooltip text shown on hover. Usually derived from shortcut label. */
  tooltipLabel: string;
  /** Aria label for accessibility. */
  ariaLabel: string;
  /** Icon to display inside the button (e.g. LuPanelLeft). */
  icon: ReactNode;
  /** Called when the button is clicked. If undefined, the button is disabled. */
  onClick?: () => void;
};

/**
 * Renders a `Tooltip > span > IconButton` pane-toggle control.
 * The `span` wrapper is required so the Tooltip works when the button is disabled.
 */
export function PaneToggleButton({ tooltipLabel, ariaLabel, icon, onClick }: PaneToggleButtonProps) {
  return (
    <Tooltip title={tooltipLabel}>
      <span>
        <IconButton
          className="electron-webkit-app-region-no-drag"
          aria-label={ariaLabel}
          onClick={onClick}
          disabled={!onClick}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}
