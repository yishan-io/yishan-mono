import { Box, Button, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { RestApiError } from "../../api/restClient";
import { getSessionBootstrapData } from "../../api/sessionApi";
import { getAuthStatus, getDaemonInfo, getDesktopAppVersion } from "../../commands/appCommands";
import { setAppLanguage } from "../../i18n";
import { rendererQueryClient } from "../../queryClient";
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
  const isAuthenticated = sessionStore((state) => state.isAuthenticated);
  const authStatusResolved = sessionStore((state) => state.authStatusResolved);
  const setAuthState = sessionStore((state) => state.setAuthState);
  const organizations = sessionStore((state) => state.organizations);
  const [appBootstrapReady, setAppBootstrapReady] = useState(false);
  const [appBootstrapError, setAppBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    const loadDaemonIdentity = async () => {
      try {
        const appVersion = await getDesktopAppVersion();
        if (disposed) {
          return;
        }

        sessionStore.getState().setAppVersion(appVersion);

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
          if (sessionData.currentUser.languagePreference) {
            await setAppLanguage(sessionData.currentUser.languagePreference);
          }
          bootstrappedSessionData = true;
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
            sessionStore.getState().setAuthState(false, true);
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
  }, [authStatusResolved, bootstrapAttempt, isAuthenticated]);

  if (!authStatusResolved) {
    return <AppBootstrapLoadingView hasError={false} onRetry={() => {}} />;
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
