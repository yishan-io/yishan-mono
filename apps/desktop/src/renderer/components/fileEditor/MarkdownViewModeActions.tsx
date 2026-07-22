import { Box, IconButton, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { LuCode, LuColumns2, LuEye } from "react-icons/lu";
import type { MarkdownViewMode } from "./types";

const toggleButtonStyles = {
  p: 0.375,
  borderRadius: 0.75,
};

/** Props for the markdown view mode toolbar actions. */
export type MarkdownViewModeActionsProps = {
  currentMode: MarkdownViewMode;
  onSelect: (mode: MarkdownViewMode) => void;
};

/** Renders toolbar actions for switching markdown editor layouts. */
export function MarkdownViewModeActions({ currentMode, onSelect }: MarkdownViewModeActionsProps) {
  return (
    <>
      <MarkdownViewModeToggle
        mode="edit"
        currentMode={currentMode}
        icon={<LuCode size={14} />}
        tooltip="Source editor"
        onSelect={onSelect}
      />
      <MarkdownViewModeToggle
        mode="split"
        currentMode={currentMode}
        icon={<LuColumns2 size={14} />}
        tooltip="Split view"
        onSelect={onSelect}
      />
      <MarkdownViewModeToggle
        mode="preview"
        currentMode={currentMode}
        icon={<LuEye size={14} />}
        tooltip="Preview"
        onSelect={onSelect}
      />
      <Box sx={{ width: "1px", height: 14, bgcolor: "divider", mx: 0.5 }} />
    </>
  );
}

type MarkdownViewModeToggleProps = {
  mode: MarkdownViewMode;
  currentMode: MarkdownViewMode;
  icon: ReactNode;
  tooltip: string;
  onSelect: (mode: MarkdownViewMode) => void;
};

function MarkdownViewModeToggle({ mode, currentMode, icon, tooltip, onSelect }: MarkdownViewModeToggleProps) {
  const isActive = mode === currentMode;

  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          aria-label={tooltip}
          aria-pressed={isActive}
          onClick={() => onSelect(mode)}
          sx={{
            ...toggleButtonStyles,
            color: isActive ? "primary.main" : "text.secondary",
            bgcolor: isActive ? "action.selected" : "transparent",
            "&:hover": {
              bgcolor: isActive ? "action.selected" : "action.hover",
            },
          }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}
