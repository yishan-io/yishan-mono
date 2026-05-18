import { Box, Button, IconButton, Paper, Slide, Snackbar, Stack, Typography } from "@mui/material";
import type { SlideProps } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { onAuthExpired } from "../api/restClient";
import { rendererQueryClient } from "../queryClient";
import { sessionStore } from "../store/sessionStore";

function SlideTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

/**
 * Shows an in-app prompt when the API session has expired and automatic
 * token refresh has failed. The user can acknowledge and sign in again.
 */
export function AuthSessionExpiredSnackbar() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthExpired(() => {
      if (sessionStore.getState().isAuthenticated) {
        setVisible(true);
      }
    });

    return unsubscribe;
  }, []);

  const handleSignIn = () => {
    setVisible(false);
    sessionStore.getState().setAuthState(false, true);
    sessionStore.getState().clearSessionData();
    rendererQueryClient.clear();
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  return (
    <Snackbar
      open={visible}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      slots={{ transition: SlideTransition }}
    >
      <Paper
        component="output"
        elevation={8}
        aria-live="assertive"
        role="alert"
        className="electron-webkit-app-region-no-drag"
        sx={{
          display: "block",
          width: 360,
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: "divider",
        }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t("auth.sessionExpired.title")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("auth.sessionExpired.description")}
              </Typography>
            </Box>
            <IconButton
              aria-label={t("auth.sessionExpired.dismissAria")}
              size="small"
              onClick={handleDismiss}
              sx={{ mt: -0.5, mr: -0.5 }}
            >
              ×
            </IconButton>
          </Box>
          <Box>
            <Button variant="contained" size="small" onClick={handleSignIn}>
              {t("auth.sessionExpired.signInAction")}
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Snackbar>
  );
}
