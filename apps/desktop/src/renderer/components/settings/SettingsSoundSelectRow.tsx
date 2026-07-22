import { Box, CircularProgress, IconButton, MenuItem, Typography } from "@mui/material";
import { BiPlay } from "react-icons/bi";
import { SettingsCompactSelect } from "./SettingsCompactControls";
import { SettingsControlRow } from "./SettingsPrimitives";

const SETTINGS_SOUND_SELECT_LAYOUT = {
  width: 220,
  menuMaxHeight: 252,
} as const;

export type SettingsSelectPreviewOption = {
  value: string;
  label: string;
};

export type SettingsSoundSelectRowProps = {
  title: string;
  description?: string;
  value: string;
  options: SettingsSelectPreviewOption[];
  selectAriaLabel: string;
  previewButtonAriaLabel: (option: SettingsSelectPreviewOption) => string;
  activePreviewValue?: string | null;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
  onPreview: (value: string) => void;
};

/**
 * Resolves one selected value label for dropdown rendering, falling back to the raw value when missing.
 */
function resolveSelectValueLabel(value: string, options: SettingsSelectPreviewOption[]): string {
  const matchedOption = options.find((option) => option.value === value);
  return matchedOption?.label ?? value;
}

/**
 * Renders one standardized sound-select row with in-menu preview controls.
 */
export function SettingsSoundSelectRow({
  title,
  description,
  value,
  options,
  selectAriaLabel,
  previewButtonAriaLabel,
  activePreviewValue,
  disabled,
  onChange,
  onPreview,
}: SettingsSoundSelectRowProps) {
  return (
    <SettingsControlRow
      title={title}
      description={description}
      control={
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <SettingsCompactSelect
            width={SETTINGS_SOUND_SELECT_LAYOUT.width}
            value={value}
            disabled={disabled}
            MenuProps={{
              PaperProps: {
                sx: {
                  width: SETTINGS_SOUND_SELECT_LAYOUT.width,
                  maxHeight: SETTINGS_SOUND_SELECT_LAYOUT.menuMaxHeight,
                  overflowY: "auto",
                },
              },
            }}
            renderValue={(selectedValue) => resolveSelectValueLabel(selectedValue as string, options)}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            slotProps={{
              input: {
                "aria-label": selectAriaLabel,
              },
            }}
          >
            {options.map((option) => {
              const isPreviewingThisOption = activePreviewValue === option.value;
              return (
                <MenuItem key={option.value} value={option.value}>
                  <Box
                    sx={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                      {option.label}
                    </Typography>
                    <IconButton
                      disabled={disabled}
                      aria-busy={isPreviewingThisOption ? "true" : "false"}
                      aria-label={previewButtonAriaLabel(option)}
                      sx={{
                        width: 22,
                        height: 22,
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        borderRadius: 1,
                        color: isPreviewingThisOption ? "primary.main" : "text.secondary",
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onPreview(option.value);
                      }}
                    >
                      {isPreviewingThisOption ? <CircularProgress size={12} thickness={6} /> : <BiPlay size={14} />}
                    </IconButton>
                  </Box>
                </MenuItem>
              );
            })}
          </SettingsCompactSelect>
        </Box>
      }
    />
  );
}
