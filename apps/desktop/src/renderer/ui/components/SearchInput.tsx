import { InputAdornment, TextField } from "@mui/material";
import { BiSearch } from "react-icons/bi";

type SearchInputProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  sizeVariant?: "large" | "medium" | "small";
  fullWidth?: boolean;
};

/** Renders a reusable search input with a leading magnifier icon. */
export function SearchInput({
  value,
  placeholder,
  onChange,
  ariaLabel,
  sizeVariant = "medium",
  fullWidth = true,
}: SearchInputProps) {
  const variantStyle =
    sizeVariant === "small"
      ? {
          iconSize: 11,
          minHeight: 28,
          fontSize: "0.74rem",
          inputPaddingY: "6px",
          borderRadius: 1.25,
        }
      : sizeVariant === "large"
        ? {
            iconSize: 16,
            minHeight: 36,
            fontSize: "0.9rem",
            inputPaddingY: "10px",
            borderRadius: 2,
          }
        : {
            iconSize: 14,
            minHeight: 32,
            fontSize: "0.82rem",
            inputPaddingY: "8px",
            borderRadius: 1.75,
          };

  return (
    <TextField
      type="search"
      size="small"
      fullWidth={fullWidth}
      value={value}
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      sx={{
        "& .MuiOutlinedInput-root": {
          minHeight: variantStyle.minHeight,
          borderRadius: variantStyle.borderRadius,
        },
        "& .MuiOutlinedInput-input": {
          fontSize: variantStyle.fontSize,
          paddingTop: variantStyle.inputPaddingY,
          paddingBottom: variantStyle.inputPaddingY,
        },
        "& .MuiInputAdornment-root": {
          marginRight: 0.5,
        },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <BiSearch size={variantStyle.iconSize} />
            </InputAdornment>
          ),
        },
        htmlInput: {
          "aria-label": ariaLabel ?? placeholder,
        },
      }}
    />
  );
}
