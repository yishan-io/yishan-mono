import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router-dom";
import { getAuthStatus } from "../../commands/appCommands";
import { authStore } from "../../store/authStore";
import { LoginView } from "../LoginView";
import { WorkspaceView } from "../WorkspaceView";

const WORKSPACE_ROUTE = "/";

/** Renders one full-screen fallback for unsupported app routes with a route back action. */
export function NotFoundRouteView() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Stack spacing={1.5} alignItems="center" sx={{ textAlign: "center", maxWidth: 420 }}>
        <Typography variant="h6">{t("routing.notFound.title")}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("routing.notFound.description")}
        </Typography>
        <Button
          variant="outlined"
          onClick={() => {
            navigate(WORKSPACE_ROUTE);
          }}
        >
          {t("routing.notFound.backToWorkspace")}
        </Button>
      </Stack>
    </Box>
  );
}

/**
 * Renders the workspace view with an outlet slot for route overlays.
 */
export function ApplicationRouterView() {
  const isAuthenticated = authStore((state) => state.isAuthenticated);
  const authStatusResolved = authStore((state) => state.authStatusResolved);
  const setAuthState = authStore((state) => state.setAuthState);

  useEffect(() => {
    if (authStatusResolved) {
      return;
    }

    let disposed = false;
    const resolveAuthStatus = async () => {
      try {
        const status = await getAuthStatus();
        if (disposed) {
          return;
        }

        setAuthState(status.authenticated, true);
      } catch {
        if (disposed) {
          return;
        }

        setAuthState(false, true);
      }
    };

    void resolveAuthStatus();

    return () => {
      disposed = true;
    };
  }, [authStatusResolved, setAuthState]);

  if (!authStatusResolved) {
    return (
      <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <Box sx={{ height: "100%", position: "relative" }}>
      <WorkspaceView />
      <Outlet />
    </Box>
  );
}
