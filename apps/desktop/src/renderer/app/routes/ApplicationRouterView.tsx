import { Box, Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router-dom";
import { sessionStore } from "../../features/session/state/sessionStore";
import { useSessionBootstrap } from "../runtime/sessionBootstrap";
import { LoginView } from "./LoginView";
import { WorkspaceView } from "../../views/WorkspaceView";
import { AppBootstrapLoadingView } from "../../views/layout/AppBootstrapLoadingView";
import { OnboardOrgView } from "./OnboardOrgView";

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
      <Stack
        spacing={1.5}
        sx={{
          alignItems: "center",
          textAlign: "center",
          maxWidth: 420,
        }}
      >
        <Typography variant="h6">{t("routing.notFound.title")}</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
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
 *
 * Session and daemon bootstrap live in `app/runtime/sessionBootstrap.ts`;
 * this route view only selects the page for the current bootstrap gate state.
 */
export function ApplicationRouterView() {
  const { t } = useTranslation();
  const { authStatusResolved, bootstrapReady, bootstrapError, onRetry } = useSessionBootstrap();
  const isAuthenticated = sessionStore((state) => state.isAuthenticated);
  const organizations = sessionStore((state) => state.organizations);

  if (!authStatusResolved) {
    return <AppBootstrapLoadingView hasError={false} onRetry={() => {}} />;
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  if (!bootstrapReady) {
    return <AppBootstrapLoadingView hasError={Boolean(bootstrapError)} onRetry={onRetry} />;
  }

  if (organizations.length === 0) {
    return <OnboardOrgView />;
  }

  return (
    <>
      <WorkspaceView />
      <Outlet />
    </>
  );
}
