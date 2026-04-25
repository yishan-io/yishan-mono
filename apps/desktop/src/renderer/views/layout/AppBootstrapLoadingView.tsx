import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type AppBootstrapLoadingViewProps = {
  hasError: boolean;
  onRetry: () => void;
};

export function AppBootstrapLoadingView(props: AppBootstrapLoadingViewProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", px: 2 }}>
      <Stack spacing={2} alignItems="center" sx={{ textAlign: "center", maxWidth: 420 }}>
        <CircularProgress size={28} />
        <Typography variant="h6">{t("app.bootstrap.title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("app.bootstrap.description")}
        </Typography>
        {props.hasError ? (
          <Button variant="outlined" onClick={props.onRetry}>
            {t("app.bootstrap.retry")}
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}
