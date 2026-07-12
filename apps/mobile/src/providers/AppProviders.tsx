import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppLanguageProvider } from "@/features/i18n/AppLanguageProvider";
import { AppThemeProvider } from "@/features/theme/AppThemeProvider";
import { queryClient } from "@/lib/query/query-client";
import { AuthProvider } from "@/providers/AuthProvider";

/** Owns top-level provider composition order for the mobile app runtime. */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppLanguageProvider>
          <AppThemeProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                {children}
              </AuthProvider>
            </QueryClientProvider>
          </AppThemeProvider>
        </AppLanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
