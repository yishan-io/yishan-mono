import { Box, LinearProgress } from "@mui/material";

type PaneLoadingBarProps = {
  testId?: string;
};

/** Renders a centered thin progress bar used as a pane-level loading indicator. */
export function PaneLoadingBar({ testId }: PaneLoadingBarProps) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", px: 2 }}>
      <LinearProgress data-testid={testId} sx={{ width: 120, height: 3, borderRadius: 999, overflow: "hidden" }} />
    </Box>
  );
}
