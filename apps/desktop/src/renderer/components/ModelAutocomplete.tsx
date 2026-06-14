import { Autocomplete, Box, CircularProgress, TextField, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { VirtualizedListbox } from "./VirtualizedListbox";

export interface ModelOption {
  id: string;
  name: string;
}

interface ModelAutocompleteProps {
  options: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  noOptionsText?: string;
  size?: "small" | "medium";
  startAdornment?: ReactNode;
  sx?: Record<string, unknown>;
}

export function ModelAutocomplete({
  options,
  value,
  onChange,
  loading = false,
  disabled = false,
  placeholder,
  noOptionsText,
  size = "small",
  startAdornment,
  sx,
}: ModelAutocompleteProps) {
  return (
    <Autocomplete
      size={size}
      freeSolo
      forcePopupIcon
      ListboxComponent={VirtualizedListbox}
      options={options}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.name || option.id)}
      value={value || null}
      onChange={(_event, newValue) => {
        onChange(typeof newValue === "string" ? newValue : (newValue?.id ?? ""));
      }}
      isOptionEqualToValue={(option, val) => option.id === (typeof val === "string" ? val : val.id)}
      loading={loading}
      disabled={disabled}
      noOptionsText={noOptionsText}
      loadingText={<CircularProgress size={16} />}
      sx={{
        "& .MuiOutlinedInput-input": {
          py: 0.5,
        },
        "& .MuiAutocomplete-popupIndicator": {
          color: "text.secondary",
        },
        ...sx,
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            startAdornment: startAdornment ? (
              <Box sx={{ ml: 1, display: "flex", alignItems: "center" }}>{startAdornment}</Box>
            ) : (
              params.InputProps.startAdornment
            ),
          }}
        />
      )}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest}>
            <Typography variant="body2" noWrap>
              {option.name}
            </Typography>
          </li>
        );
      }}
    />
  );
}
