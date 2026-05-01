import "./style.css";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppUpdateSnackbar } from "./components/AppUpdateSnackbar";
import { WorkspaceOverlay } from "./components/WorkspaceOverlay";
import { startBackendEventPipeline, startBackendEventStoreBindings } from "./events";
import { AppThemePreferenceProvider, useThemePreference } from "./hooks/useThemePreference";
import { i18n } from "./i18n";
import { rendererQueryClient } from "./queryClient";
import { createAppTheme } from "./theme";
import { KeyBindingsView } from "./views/KeyBindingsView";
import { SettingsView } from "./views/SettingsView";
import { AppShell } from "./views/layout/AppShell";
import { ApplicationRouterView, NotFoundRouteView } from "./views/layout/ApplicationRouterView";

/** Renders app routes with a shared theme-preference context. */
function AppRoot() {
  const { themeMode } = useThemePreference();
  const appTheme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  useEffect(() => {
    const stopPipeline = startBackendEventPipeline();
    const stopStoreBindings = startBackendEventStoreBindings();

    return () => {
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
                <Route
                  path="keybindings"
                  element={
                    <WorkspaceOverlay>
                      <KeyBindingsView />
                    </WorkspaceOverlay>
                  }
                />
              </Route>
              <Route path="*" element={<NotFoundRouteView />} />
            </Route>
          </Routes>
        </HashRouter>
        <AppUpdateSnackbar />
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
