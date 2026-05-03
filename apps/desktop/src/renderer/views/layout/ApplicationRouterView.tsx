import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { RestApiError } from "../../api/restClient";
import { getSessionBootstrapData } from "../../api/sessionApi";
import { getAuthStatus, getDaemonInfo } from "../../commands/appCommands";
import { loadWorkspaceFromBackend } from "../../commands/projectCommands";
import { rendererQueryClient } from "../../queryClient";
import { authStore } from "../../store/authStore";
import { sessionStore } from "../../store/sessionStore";
import { LoginView } from "../LoginView";
import { WorkspaceView } from "../WorkspaceView";
import { AppBootstrapLoadingView } from "./AppBootstrapLoadingView";
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
  const { t } = useTranslation();
  const isAuthenticated = authStore((state) => state.isAuthenticated);
  const authStatusResolved = authStore((state) => state.authStatusResolved);
  const setAuthState = authStore((state) => state.setAuthState);
  const organizations = sessionStore((state) => state.organizations);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const [appBootstrapReady, setAppBootstrapReady] = useState(false);
  const [appBootstrapError, setAppBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    const loadDaemonIdentity = async () => {
      try {
        const daemonInfo = await getDaemonInfo();
        if (disposed) {
          return;
        }

        sessionStore.getState().setDaemonInfo({
          daemonId: daemonInfo.daemonId,
          daemonVersion: daemonInfo.version,
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug("[ApplicationRouterView] failed to load daemon info", error);
        }
      }
    };

    loadDaemonIdentity();

    return () => {
      disposed = true;
    };
  }, []);

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

  useEffect(() => {
    if (!authStatusResolved || !isAuthenticated) {
      setAppBootstrapReady(false);
      setAppBootstrapError(null);
      return;
    }

    void bootstrapAttempt;
    void selectedOrganizationId;

    let disposed = false;
    const bootstrapSession = async () => {
      let bootstrappedSessionData = false;
      try {
        const sessionState = sessionStore.getState();
        const sessionAlreadyLoaded = sessionState.loaded;

        // Only reset bootstrap readiness when loading session data for the first
        // time. When session data is already loaded (e.g. after org creation in
        // OnboardOrgView), avoid flashing the loading screen while workspace data
        // refreshes in the background.
        if (!sessionAlreadyLoaded) {
          setAppBootstrapReady(false);
        }
        setAppBootstrapError(null);

        if (!sessionAlreadyLoaded) {
          const sessionData = await rendererQueryClient.fetchQuery({
            queryKey: ["session-bootstrap"],
            queryFn: getSessionBootstrapData,
            staleTime: 30_000,
            retry: false,
          });
          if (disposed) {
            return;
          }

          const previousSelectedOrganizationId = sessionStore.getState().selectedOrganizationId;
          sessionStore.getState().setSessionData({
            currentUser: sessionData.currentUser,
            organizations: sessionData.organizations,
            selectedOrganizationId: previousSelectedOrganizationId,
          });
          bootstrappedSessionData = true;
        }

        await loadWorkspaceFromBackend();
        if (disposed) {
          return;
        }

        const selectedOrganizationId = sessionStore.getState().selectedOrganizationId?.trim();
        if (selectedOrganizationId) {
          const nodes = await api.node.listByOrg(selectedOrganizationId);
          if (disposed) {
            return;
          }

          rendererQueryClient.setQueryData(["org-nodes", selectedOrganizationId], nodes);
        }

        if (!disposed) {
          setAppBootstrapReady(true);
        }
      } catch (error) {
        if (!disposed) {
          if (bootstrappedSessionData) {
            sessionStore.getState().clearSessionData();
          }

          // A 401 from the API means the session token is invalid or expired.
          // Transition back to the login view instead of showing a retry screen.
          if (error instanceof RestApiError && error.status === 401) {
            authStore.getState().setAuthState(false, true);
            sessionStore.getState().clearSessionData();
            rendererQueryClient.clear();
            return;
          }

          setAppBootstrapReady(false);
          setAppBootstrapError("failed");
        }
      }
    };

    bootstrapSession();

    return () => {
      disposed = true;
    };
  }, [authStatusResolved, bootstrapAttempt, isAuthenticated, selectedOrganizationId]);

  if (!authStatusResolved) {
    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box
          component="header"
          className="electron-webkit-app-region-drag"
          sx={{
            height: 42,
            minHeight: 42,
            px: 1,
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
          }}
        />
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress size={28} />
        </Box>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  if (!appBootstrapReady) {
    return (
      <AppBootstrapLoadingView
        hasError={Boolean(appBootstrapError)}
        onRetry={() => {
          setBootstrapAttempt((value) => value + 1);
        }}
      />
    );
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
