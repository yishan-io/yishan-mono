import { useEffect, useState } from "react";
import { getAuthStatus, getDaemonInfo, getDesktopAppVersion } from "../../app/commands/appCommands";
import { listOrgNodes } from "../../domains/node/commands/nodeCommands";
import { getSessionBootstrapData, isAuthExpiredError } from "../../domains/session/commands/sessionCommands";
import { sessionStore } from "../../domains/session/state/sessionStore";
import { setAppLanguage } from "../../i18n";
import { rendererQueryClient } from "../../queryClient";

/**
 * Application session bootstrap — the single owner for daemon identity, auth
 * status resolution, and session bootstrap (Phase 11, desktop5.md).
 *
 * The route view calls this hook and renders against the returned gate state.
 * Startup order and recovery behavior mirror the former inline effects in
 * ApplicationRouterView exactly.
 */
export function useSessionBootstrap() {
  const [appBootstrapReady, setAppBootstrapReady] = useState(false);
  const [appBootstrapError, setAppBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  const authStatusResolved = sessionStore((state) => state.authStatusResolved);
  const isAuthenticated = sessionStore((state) => state.isAuthenticated);
  const currentUserId = sessionStore((state) => state.currentUserId);
  const setAuthState = sessionStore((state) => state.setAuthState);

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
          console.debug("[useSessionBootstrap] failed to load daemon info", error);
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
        const persistedUserId = sessionState.currentUserId;
        const loadedUserId = sessionState.currentUser?.id ?? null;

        // An account switch while the renderer is running is detectable when
        // the persisted user id (the last-known account anchor) no longer
        // matches the currently loaded session's user. The anchor only changes
        // through store updates (e.g. cross-window localStorage propagation of
        // a login in another window); this effect re-runs on currentUserId so
        // the mismatch is acted on. A CLI-only login in another terminal while
        // this window stays untouched is not signaled to the store — it is
        // covered on the next session re-bootstrap (app restart / re-login).
        const accountSwitched = persistedUserId !== null && sessionAlreadyLoaded && persistedUserId !== loadedUserId;

        // Only reset bootstrap readiness when loading session data for the first
        // time. When session data is already loaded (e.g. after org creation in
        // OnboardOrgView), avoid flashing the loading screen while workspace data
        // refreshes in the background.
        if (!sessionAlreadyLoaded) {
          setAppBootstrapReady(false);
        }
        setAppBootstrapError(null);

        if (!sessionAlreadyLoaded || accountSwitched) {
          if (accountSwitched) {
            // Drop cached queries BEFORE re-fetching so the session-bootstrap
            // query cannot serve the previous user's cached data.
            rendererQueryClient.clear();
          }
          const sessionData = await rendererQueryClient.fetchQuery({
            queryKey: ["session-bootstrap"],
            queryFn: getSessionBootstrapData,
            staleTime: 30_000,
            retry: false,
          });
          if (disposed) {
            return;
          }

          // The best-known previous user is the loaded session's user, falling
          // back to the persisted anchor (e.g. after a reload the session is not
          // loaded but the anchor survived). A mismatch with the freshly fetched
          // user means the account changed: clear cached queries and drop the
          // previous user's persisted org selection.
          const previousUserId = loadedUserId ?? persistedUserId;
          const sessionUserChanged = previousUserId !== null && previousUserId !== sessionData.currentUser.id;
          if (sessionUserChanged) {
            rendererQueryClient.clear();
          }
          sessionStore.getState().setSessionData({
            currentUser: sessionData.currentUser,
            organizations: sessionData.organizations,
            selectedOrganizationId: sessionUserChanged ? undefined : sessionStore.getState().selectedOrganizationId,
          });
          if (sessionData.currentUser.languagePreference) {
            await setAppLanguage(sessionData.currentUser.languagePreference);
          }
          bootstrappedSessionData = true;
        }

        const selectedOrganizationId = sessionStore.getState().selectedOrganizationId?.trim();
        if (selectedOrganizationId) {
          const nodes = await listOrgNodes(selectedOrganizationId);
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
          if (isAuthExpiredError(error)) {
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
  }, [authStatusResolved, bootstrapAttempt, isAuthenticated, currentUserId]);

  return {
    authStatusResolved,
    bootstrapReady: appBootstrapReady,
    bootstrapError: appBootstrapError,
    onRetry: () => {
      setBootstrapAttempt((value) => value + 1);
    },
  };
}
