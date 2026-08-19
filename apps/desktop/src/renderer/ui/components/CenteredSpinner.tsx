import { Box, CircularProgress } from "@mui/material";

export type CenteredSpinnerProps = {
  /** CircularProgress size in pixels. Defaults to 20. */
  size?: number;
  /** Vertical padding. Defaults to 4. */
  py?: number;
};

/**
 * Renders a centered loading spinner inside a flex container.
 *
 * Use this as a loading placeholder in settings panels, data tables,
 * or any view that needs a vertically-centered progress indicator.
 *
 * @example
 * ```tsx
 * {isLoading ? <CenteredSpinner /> : <DataTable ... />}
 * ```
 */
export function CenteredSpinner({ size = 20, py = 4 }: CenteredSpinnerProps) {
  return (
    <Box sx={{ py, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <CircularProgress size={size} />
    </Box>
  );
}
