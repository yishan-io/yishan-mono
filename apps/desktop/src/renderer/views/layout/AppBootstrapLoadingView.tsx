import { Box, Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import yishanLogo from "../../../assets/images/yishan-transparent.png";
import { AppBackgroundContainer } from "../../components/AppBackgroundContainer";

type AppBootstrapLoadingViewProps = {
  hasError: boolean;
  onRetry: () => void;
};

export function AppBootstrapLoadingView(props: AppBootstrapLoadingViewProps) {
  const { t } = useTranslation();

  return (
    <AppBackgroundContainer>
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box
          component="header"
          className="electron-webkit-app-region-drag"
          data-testid="bootstrap-loading-topbar"
          sx={{
            height: 42,
            minHeight: 42,
            px: 1,
            display: "flex",
            alignItems: "center",
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        />
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            px: { xs: 2, sm: 4 },
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Stack
            spacing={2}
            sx={{
              width: "100%",
              maxWidth: 540,
              p: { xs: 1, sm: 1.5 },
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                mb: 0.5,
              }}
            >
              <Box
                component="img"
                src={yishanLogo}
                alt=""
                sx={{
                  width: 210,
                  height: "auto",
                  opacity: 0.2,
                  transformOrigin: "center",
                  animation: "bootstrap-logo-breathe 2.8s ease-in-out infinite",
                  "@keyframes bootstrap-logo-breathe": {
                    "0%": {
                      opacity: 0.14,
                      transform: "scale(0.985)",
                    },
                    "50%": {
                      opacity: 0.24,
                      transform: "scale(1.02)",
                    },
                    "100%": {
                      opacity: 0.14,
                      transform: "scale(0.985)",
                    },
                  },
                }}
              />
            </Box>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 2.4 }}>
              {t("app.bootstrap.badge")}
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5, color: "text.secondary" }}>
              {t("app.bootstrap.title")}
            </Typography>
            {props.hasError ? (
              <Button
                className="electron-webkit-app-region-no-drag"
                variant="outlined"
                onClick={props.onRetry}
                sx={{ mt: 1 }}
              >
                {t("app.bootstrap.retry")}
              </Button>
            ) : null}
          </Stack>
        </Box>
      </Box>
    </AppBackgroundContainer>
  );
}
