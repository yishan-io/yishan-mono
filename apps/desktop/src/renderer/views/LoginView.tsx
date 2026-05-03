import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaGoogle } from "react-icons/fa";
import logo from "../../assets/images/yishan-transparent.png";
import { login } from "../commands/appCommands";
import { authStore } from "../store/authStore";

/** Renders one pre-authentication entry screen with Google sign-in action. */
export function LoginView() {
  const { t } = useTranslation();
  const setAuthState = authStore((state) => state.setAuthState);
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

      setAuthState(true, true);
    } catch {
      setErrorMessage(t("auth.login.errors.unexpected"));
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <Box
      className="electron-webkit-app-region-drag"
      sx={{
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 3,
        userSelect: "none",
      }}
    >
      <Stack
        spacing={2.5}
        sx={{
          width: "100%",
          maxWidth: 460,
          textAlign: "center",
        }}
      >
        <Box component="img" src={logo} alt="" sx={{ width: 256, height: 256, alignSelf: "center" }} />
        <Stack spacing={1}>
          <Typography variant="h4" fontWeight={700}>
            {t("auth.login.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("auth.login.description")}
          </Typography>
        </Stack>

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
    </Box>
  );
}
