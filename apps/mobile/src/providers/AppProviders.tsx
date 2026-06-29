import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppLanguageProvider } from "@/features/i18n/AppLanguageProvider";
import { MeLanguagePreferenceSync } from "@/features/me/components/MeLanguagePreferenceSync";
import { AppTerminalRendererProvider } from "@/features/shell/AppTerminalRendererProvider";
import { AppThemeProvider } from "@/features/theme/AppThemeProvider";
import { queryClient } from "@/lib/query/query-client";
import { AuthProvider } from "@/providers/AuthProvider";
import { NotificationRuntimeProvider } from "@/providers/NotificationRuntimeProvider";

/** Owns top-level provider composition order for the mobile app runtime. */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppLanguageProvider>
          <AppTerminalRendererProvider>
            <AppThemeProvider>
              <QueryClientProvider client={queryClient}>
                <AuthProvider>
                  <MeLanguagePreferenceSync />
                  <NotificationRuntimeProvider>{children}</NotificationRuntimeProvider>
                </AuthProvider>
              </QueryClientProvider>
            </AppThemeProvider>
          </AppTerminalRendererProvider>
        </AppLanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
