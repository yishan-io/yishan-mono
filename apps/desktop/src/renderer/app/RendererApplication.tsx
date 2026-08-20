import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { startBackendEventHandlers } from "../app/events";
import { startDaemonIdentityRuntime } from "../app/runtime/daemonIdentity";
import { AppThemePreferenceProvider, useThemePreference } from "../domains/settings";
import { startBackendEventPipeline } from "../events";
import { i18n, initI18n } from "../i18n";
import { rendererQueryClient } from "../queryClient";
import { createAppTheme } from "../ui/theme";
import { AppUpdateSnackbar } from "./features/launch/AppUpdateSnackbar";
import { AuthSessionExpiredSnackbar } from "./features/launch/AuthSessionExpiredSnackbar";
import { AppRoutes } from "./routes/AppRoutes";

// Initialize the app-wide i18next instance before any provider renders
// (previously a module-scope side effect in i18n.ts; explicit here so importing
// i18n.ts never initializes the global instance — e.g. in tests).
void initI18n();

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

/**
 * The Renderer application root — owns provider composition, route mounting,
 * and global event startup/shutdown (Phase 11, desktop5.md).
 *
 * `main.tsx` only mounts this component; all feature workflow lives below.
 */
export function RendererApplication() {
  return (
    <I18nextProvider i18n={i18n}>
      <AppThemePreferenceProvider>
        <AppRoot />
      </AppThemePreferenceProvider>
    </I18nextProvider>
  );
}

/** Renders app providers, routes, and global event wiring with a shared theme-preference context. */
function AppRoot() {
  const { themeMode } = useThemePreference();
  const appTheme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  useEffect(() => {
    const stopIdentityRuntime = startDaemonIdentityRuntime();
    const stopPipeline = startBackendEventPipeline();
    const stopStoreBindings = startBackendEventHandlers();

    return () => {
      stopStoreBindings();
      stopPipeline();
      stopIdentityRuntime();
    };
  }, []);

  return (
    <QueryClientProvider client={rendererQueryClient}>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <AppRoutes />
        <AppUpdateSnackbar />
        <AuthSessionExpiredSnackbar />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
