import { Paragraph, YStack, useTheme } from "tamagui";

import { ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsLanguageSection } from "@/features/settings/components/SettingsLanguageSection";
import { SettingsNotificationsSection } from "@/features/settings/components/SettingsNotificationsSection";
import { SettingsThemeSection } from "@/features/settings/components/SettingsThemeSection";
import { useSettingsScreenModel } from "@/features/settings/hooks/useSettingsScreenModel";

export function SettingsScreen() {
  const model = useSettingsScreenModel();

  if (model.meQuery.isLoading) {
    return <LoadingView label={model.t("settings.loading")} />;
  }

  if (model.meQuery.isError || !model.meQuery.data) {
    return <ErrorState onRetry={() => model.meQuery.refetch()} />;
  }

  return (
    <ScreenScaffold title={model.t("settings.title")} onBack={model.onBack} scrollable={false}>
      <YStack style={{ flex: 1, gap: 16, paddingBottom: 24, paddingTop: 12 }}>
        <YStack style={{ flex: 1, gap: 16 }}>
          <SectionCard>
            <SettingsLanguageSection
              currentLanguage={model.meQuery.data.languagePreference}
              onSelectLanguage={model.onSelectLanguage}
              pending={model.languageMutation.isPending}
            />
            <SettingsThemeSection preference={model.themePreference} onSelectTheme={model.onSelectTheme} />
            <SettingsNotificationsSection
              enabled={model.meQuery.data.notificationPreferences.enabled}
              isLoading={model.notificationPermission.isLoading}
              isRequesting={model.notificationPermission.isRequesting}
              onOpenSystemSettings={model.onOpenSystemSettings}
              onRequestPermission={model.onRequestNotificationPermission}
              pending={model.notificationMutation.isPending}
              onToggle={model.onToggleNotifications}
              status={model.notificationPermission.status}
            />
          </SectionCard>
          {model.hasMutationError ? (
            <Paragraph color="$red10" size="$3">
              {model.t("errors.genericMessage")}
            </Paragraph>
          ) : null}
        </YStack>
      </YStack>
    </ScreenScaffold>
  );
}
