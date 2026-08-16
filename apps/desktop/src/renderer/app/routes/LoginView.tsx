import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaGoogle } from "react-icons/fa";
import logo from "../../../assets/images/yishan-transparent.png";
import { resetAuthExpiredState } from "../../features/session/commands/sessionCommands";
import { login } from "../../commands/appCommands";
import { AppBackgroundContainer } from "../../components/AppBackgroundContainer";
import { CenteredContentLayout } from "../../components/CenteredContentLayout";
import { sessionStore } from "../../features/session/model/sessionStore";

/** Renders one pre-authentication entry screen with Google sign-in action. */
export function LoginView() {
  const { t } = useTranslation();
  const setAuthState = sessionStore((state) => state.setAuthState);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      const loginResult = await login();
      if (!loginResult.authenticated) {
        setErrorMessage(loginResult.error || t("auth.login.errors.commandFailed"));
        return;
      }

      resetAuthExpiredState();
      setAuthState(true, true);
    } catch {
      setErrorMessage(t("auth.login.errors.unexpected"));
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <AppBackgroundContainer>
      <CenteredContentLayout className="electron-webkit-app-region-drag" maxWidth={460}>
        <Stack spacing={2.5} sx={{ textAlign: "center" }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
            }}
          >
            {t("auth.login.title")}
          </Typography>
          <Box component="img" src={logo} alt="" sx={{ width: 160, height: 124, alignSelf: "center" }} />
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            {t("auth.login.description")}
          </Typography>

          {errorMessage ? (
            <Alert severity="error" role="alert" className="electron-webkit-app-region-no-drag">
              {errorMessage}
            </Alert>
          ) : null}

          <Button
            className="electron-webkit-app-region-no-drag"
            variant="contained"
            size="large"
            onClick={() => {
              void handleGoogleSignIn();
            }}
            disabled={isSigningIn}
            startIcon={isSigningIn ? <CircularProgress size={18} color="inherit" /> : <FaGoogle size={18} />}
          >
            {isSigningIn ? t("auth.login.signingIn") : t("auth.login.googleCta")}
          </Button>
        </Stack>
      </CenteredContentLayout>
    </AppBackgroundContainer>
  );
}
