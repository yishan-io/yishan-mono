import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { Component, type ErrorInfo, type ReactNode } from "react";

export type SettingsErrorBoundaryProps = {
  /** Section label shown in the fallback UI so the user knows which panel failed. */
  sectionLabel: string;
  children: ReactNode;
};

type SettingsErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render-time exceptions inside one settings panel and shows a recoverable
 * fallback instead of blanking the entire view.
 */
export class SettingsErrorBoundary extends Component<SettingsErrorBoundaryProps, SettingsErrorBoundaryState> {
  override state: SettingsErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SettingsErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[SettingsErrorBoundary] ${this.props.sectionLabel} render error`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" sx={{ mb: 1 }}>
            <Stack spacing={0.5}>
              <Typography variant="body2">Something went wrong while rendering {this.props.sectionLabel}.</Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                {this.state.error.message}
              </Typography>
            </Stack>
          </Alert>
          <Button size="small" variant="outlined" onClick={this.handleRetry}>
            Retry
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
