import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { LoadingView } from "@/components/ui/LoadingView";
import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { AppProviders } from "@/providers/AppProviders";

void SplashScreen.preventAutoHideAsync();

function RootContent() {
  const { status } = useAuth();
  const { t } = useAppLanguage();

  useEffect(() => {
    if (status !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [status]);

  if (status === "loading") {
    return <LoadingView label={t("auth.restoringSession")} />;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootContent />
    </AppProviders>
  );
}
