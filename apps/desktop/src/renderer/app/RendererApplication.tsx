import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { openLink } from "../commands/appCommands";
import { AppUpdateSnackbar } from "../components/AppUpdateSnackbar";
import { AuthSessionExpiredSnackbar } from "../components/AuthSessionExpiredSnackbar";
import { startBackendEventHandlers, startBackendEventPipeline } from "../events";
import { AppThemePreferenceProvider, useThemePreference } from "../hooks/useThemePreference";
import { i18n } from "../i18n";
import { rendererQueryClient } from "../queryClient";
import { subscribeDesktopRpcEvent } from "../rpc/rpcTransport";
import { createAppTheme } from "../theme";
import { AppRoutes } from "./routes/AppRoutes";

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
    const stopPipeline = startBackendEventPipeline();
    const stopStoreBindings = startBackendEventHandlers();

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
        <AppRoutes />
        <AppUpdateSnackbar />
        <AuthSessionExpiredSnackbar />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
