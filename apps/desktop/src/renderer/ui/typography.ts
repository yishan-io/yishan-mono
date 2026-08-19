import type { SxProps, Theme } from "@mui/material/styles";

/**
 * MUI `sx` value that applies the standard monospace font stack.
 * Use for inline-code displays, terminal output, and file path labels.
 */
export const MONOSPACE_SX: SxProps<Theme> = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
