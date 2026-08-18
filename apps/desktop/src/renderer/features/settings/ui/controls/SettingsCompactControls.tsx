import { Select, type SelectProps, TextField, type TextFieldProps } from "@mui/material";

const SETTINGS_COMPACT_CONTROL_BASE_SX = {
  maxWidth: "100%",
  "& .MuiSelect-select.MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    fontSize: "0.82rem",
    lineHeight: 1.25,
    minHeight: "unset",
    py: 0.875,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  "& .MuiInputBase-input": {
    fontSize: "0.82rem",
    lineHeight: 1.25,
    py: 0.875,
  },
} as const;

type SettingsCompactControlProps = {
  width: number;
};

type SettingsCompactSelectProps = Omit<SelectProps<string>, "size"> & SettingsCompactControlProps;
type SettingsCompactTextFieldProps = Omit<TextFieldProps, "size"> & SettingsCompactControlProps;

/**
 * Renders one standardized compact select used by settings rows.
 */
export function SettingsCompactSelect({ width, ...selectProps }: SettingsCompactSelectProps) {
  return <Select size="small" sx={{ ...SETTINGS_COMPACT_CONTROL_BASE_SX, width }} {...selectProps} />;
}

/**
 * Renders one standardized compact text field used by settings rows.
 */
export function SettingsCompactTextField({ width, ...textFieldProps }: SettingsCompactTextFieldProps) {
  return <TextField size="small" sx={{ ...SETTINGS_COMPACT_CONTROL_BASE_SX, width }} {...textFieldProps} />;
}
