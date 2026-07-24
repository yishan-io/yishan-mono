import { Alert, Box, LinearProgress, Typography } from "@mui/material";

type FileOperationState = {
  status: string;
  processed: number;
  total: number;
  currentPath?: string;
};

type FileOperationStatusProps = {
  operationState: FileOperationState | null | undefined;
  operationError: string | null | undefined;
  progressText: string;
};

function getProgressValue(operation: FileOperationState): number {
  if (operation.total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((operation.processed / operation.total) * 100));
}

/** Renders the file-operation progress bar and any persistent error banner. */
export function FileOperationStatus({ operationState, operationError, progressText }: FileOperationStatusProps) {
  return (
    <>
      {operationState?.status === "running" ? (
        <Box
          sx={{
            px: 1.5,
            pt: 1,
            pb: 0.25,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          <Typography variant="caption" color="text.secondary" data-testid="file-operation-progress-label">
            {progressText}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={getProgressValue(operationState)}
            data-testid="file-operation-progress-bar"
          />
        </Box>
      ) : null}
      {operationError ? (
        <Box sx={{ px: 1.5, pt: 1, flexShrink: 0 }}>
          <Alert severity="error" data-testid="file-operation-error">
            {operationError}
          </Alert>
        </Box>
      ) : null}
    </>
  );
}
