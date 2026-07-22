import { Box, IconButton, Popover } from "@mui/material";
import { PROJECT_ICON_OPTIONS } from "@renderer/components/projectIcons";
import type { Dispatch, SetStateAction } from "react";
import type { ProjectConfigDraft } from "../useProjectConfigFormState";

type ProjectConfigIconPickerPopoverProps = {
  anchorEl: HTMLElement | null;
  icon: string;
  setDraft: Dispatch<SetStateAction<ProjectConfigDraft>>;
  setIconAnchorEl: Dispatch<SetStateAction<HTMLElement | null>>;
};

export function ProjectConfigIconPickerPopover({
  anchorEl,
  icon,
  setDraft,
  setIconAnchorEl,
}: ProjectConfigIconPickerPopoverProps) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={() => setIconAnchorEl(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
    >
      <Box
        sx={{
          p: 1.25,
          display: "grid",
          gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
          gap: 1,
        }}
      >
        {PROJECT_ICON_OPTIONS.map((option) => {
          const selected = option.id === icon;
          return (
            <IconButton
              key={option.id}
              aria-label="Choose icon"
              onClick={() => {
                setDraft((previous) => ({
                  ...previous,
                  icon: option.id,
                }));
                setIconAnchorEl(null);
              }}
              sx={{
                width: 32,
                height: 32,
                border: 1,
                borderColor: selected ? "primary.main" : "divider",
                bgcolor: selected ? "action.selected" : undefined,
              }}
            >
              <option.Icon size={16} />
            </IconButton>
          );
        })}
      </Box>
    </Popover>
  );
}
