import "./style.css";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { HashRouter, Route, Routes } from "react-router-dom";
import { openLink } from "./commands/appCommands";
import { AppUpdateSnackbar } from "./components/AppUpdateSnackbar";
import { AuthSessionExpiredSnackbar } from "./components/AuthSessionExpiredSnackbar";
import { WorkspaceOverlay } from "./components/WorkspaceOverlay";
import { startBackendEventPipeline, startBackendEventStoreBindings } from "./events";
import { AppThemePreferenceProvider, useThemePreference } from "./hooks/useThemePreference";
import { i18n } from "./i18n";
import { rendererQueryClient } from "./queryClient";
import { subscribeDesktopRpcEvent } from "./rpc/rpcTransport";
import { createAppTheme } from "./theme";
import { SettingsView } from "./views/SettingsView";
import { AppShell } from "./views/layout/AppShell";
import { ApplicationRouterView, NotFoundRouteView } from "./views/layout/ApplicationRouterView";

// React 19 dev mode emits performance.measure() entries for every component render/update.
// These accumulate indefinitely in the Performance API buffer and cause unbounded memory growth.
// Periodically clear the buffer to prevent multi-GB leaks during long dev sessions.
if (import.meta.env.DEV) {
  const PERFORMANCE_BUFFER_FLUSH_INTERVAL_MS = 10_000;
  setInterval(() => {
    performance.clearMeasures();
    performance.clearMarks();
  }, PERFORMANCE_BUFFER_FLUSH_INTERVAL_MS);
}

/** Renders app routes with a shared theme-preference context. */
function AppRoot() {
  const { themeMode } = useThemePreference();
  const appTheme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  useEffect(() => {
    const stopPipeline = startBackendEventPipeline();
    const stopStoreBindings = startBackendEventStoreBindings();

    // Listen for webview new-window requests forwarded from the main process
    // (triggered by Cmd+Click, target="_blank", window.open in <webview> guests)
    // and open the URL using the common openLink handler which respects the
    // user's built-in vs external browser preference.
    const unsubscribeWebviewOpenUrl = subscribeDesktopRpcEvent((event) => {
      if (event.method !== "webviewOpenUrl") {
        return;
      }
      const payload = event.payload as { url?: string } | undefined;
      const url = payload?.url;
      if (url) {
        void openLink({ url });
      }
    });

    return () => {
      unsubscribeWebviewOpenUrl();
      stopStoreBindings();
      stopPipeline();
    };
  }, []);

  return (
    <QueryClientProvider client={rendererQueryClient}>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<ApplicationRouterView />}>
                <Route index element={null} />
                <Route
                  path="settings"
                  element={
                    <WorkspaceOverlay>
                      <SettingsView />
                    </WorkspaceOverlay>
                  }
                />
              </Route>
              <Route path="*" element={<NotFoundRouteView />} />
            </Route>
          </Routes>
        </HashRouter>
        <AppUpdateSnackbar />
        <AuthSessionExpiredSnackbar />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const root = document.getElementById("app");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <AppThemePreferenceProvider>
        <AppRoot />
      </AppThemePreferenceProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
