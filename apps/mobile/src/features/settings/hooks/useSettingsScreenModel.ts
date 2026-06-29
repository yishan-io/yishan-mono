import { useRouter } from "expo-router";
import { Platform } from "react-native";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useMeQuery } from "@/features/me/queries/useMeQuery";
import { useNotificationPermission } from "@/features/notifications/hooks/useNotificationPermission";
import { useAppTerminalRenderer } from "@/features/shell/AppTerminalRendererProvider";
import { useAppTheme } from "@/features/theme/AppThemeProvider";
import { goBackOrReplace } from "@/lib/navigation/go-back-or-replace";
import { useSettingsPreferenceMutations } from "./useSettingsPreferenceMutations";

export function useSettingsScreenModel() {
  const router = useRouter();
  const { session } = useAuth();
  const { setPreference: setLanguagePreference, t } = useAppLanguage();
  const { preference: terminalRendererPreference, setPreference: setTerminalRendererPreference } =
    useAppTerminalRenderer();
  const { preference: themePreference, setPreference: setThemePreference } = useAppTheme();
  const notificationPermission = useNotificationPermission();
  const meQuery = useMeQuery();
  const accessToken = session?.accessToken;
  const settingsMutations = useSettingsPreferenceMutations({
    accessToken,
    setLanguagePreference,
  });

  return {
    accessToken,
    hasMutationError: settingsMutations.hasMutationError,
    languageMutation: settingsMutations.languageMutation,
    meQuery,
    notificationMutation: settingsMutations.notificationMutation,
    notificationPermission,
    onBack: () => goBackOrReplace(router, "/(app)/shell"),
    onSelectLanguage: settingsMutations.onSelectLanguage,
    onSelectTerminalRenderer: (nextPreference: typeof terminalRendererPreference) =>
      void setTerminalRendererPreference(nextPreference),
    onSelectTheme: (nextPreference: typeof themePreference) => void setThemePreference(nextPreference),
    onToggleNotifications: settingsMutations.onToggleNotifications,
    onOpenSystemSettings: () => void notificationPermission.openSystemSettings(),
    onRequestNotificationPermission: () => void notificationPermission.requestPermission(),
    showTerminalRendererSetting: Platform.OS !== "web",
    t,
    terminalRendererPreference,
    themePreference,
  };
}
