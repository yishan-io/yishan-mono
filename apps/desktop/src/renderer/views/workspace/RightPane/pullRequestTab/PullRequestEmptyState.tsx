import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface PullRequestEmptyStateProps {
  actionError: string | null;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  worktreePath: string | undefined;
}

/** Renders the empty state for the pull request tab. */
export default function PullRequestEmptyState({
  actionError,
  isRefreshing,
  onRefresh,
  worktreePath,
}: PullRequestEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", px: 3 }}>
      <Stack spacing={1.5} alignItems="center">
        <Typography variant="body2" sx={{ color: "#999", textAlign: "center" }}>
          {t("workspace.pr.empty")}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => void onRefresh()}
          disabled={isRefreshing || !worktreePath}
        >
          {isRefreshing ? t("workspace.pr.refreshing") : t("workspace.pr.refresh")}
        </Button>
        {actionError ? <Alert severity="error">{actionError}</Alert> : null}
      </Stack>
    </Box>
  );
}
