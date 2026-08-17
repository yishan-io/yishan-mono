import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

type GitChangeTotalsProps = {
  additions: number;
  deletions: number;
  showWhenZero?: boolean;
  hideZeroSides?: boolean;
  testId?: string;
  className?: string;
  sx?: SxProps<Theme>;
};

/** Renders one consistent +additions/-deletions summary token pair. */
export function GitChangeTotals({
  additions,
  deletions,
  showWhenZero = false,
  hideZeroSides = false,
  testId,
  className,
  sx,
}: GitChangeTotalsProps) {
  const normalizedAdditions = Math.max(0, additions);
  const normalizedDeletions = Math.max(0, deletions);
  const hasChanges = normalizedAdditions > 0 || normalizedDeletions > 0;

  if (!showWhenZero && !hasChanges) {
    return null;
  }

  return (
    <Box
      className={className}
      data-testid={testId}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        ...sx,
      }}
    >
      {hideZeroSides && normalizedAdditions === 0 ? null : (
        <Typography variant="caption" sx={{ color: "success.main", fontWeight: 500 }}>
          +{normalizedAdditions}
        </Typography>
      )}
      {hideZeroSides && normalizedDeletions === 0 ? null : (
        <Typography variant="caption" sx={{ color: "error.main", fontWeight: 500 }}>
          -{normalizedDeletions}
        </Typography>
      )}
    </Box>
  );
}
