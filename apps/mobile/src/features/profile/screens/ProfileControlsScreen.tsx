import { Building2, ChevronRight, LogOut, Settings2 } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Separator, Text, XStack, YStack } from "tamagui";

import { ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { SectionCard } from "@/components/ui/SectionCard";
import { SheetListRow } from "@/components/ui/SheetListRow";
import { SettingsProfileSection } from "@/features/settings/components/SettingsProfileSection";
import { useProfileControlsScreenModel } from "../hooks/useProfileControlsScreenModel";

export function ProfileControlsScreen() {
  const model = useProfileControlsScreenModel();

  if (model.meQuery.isLoading) {
    return <LoadingView label={model.t("settings.loading")} />;
  }

  if (model.meQuery.isError || !model.meQuery.data) {
    return (
      <ErrorState
        onRetry={() => {
          void model.meQuery.refetch();
        }}
      />
    );
  }

  return (
    <ScreenScaffold
      backButtonVariant="close"
      onBack={model.onBack}
      scrollable={false}
      title={model.t("common.account")}
    >
      <YStack style={{ flex: 1, gap: 16, paddingBottom: 24, paddingTop: 12 }}>
        <SettingsProfileSection user={model.meQuery.data} />

        <SectionCard>
          <SheetListRow
            minHeight={56}
            onPress={model.onOpenOrganizations}
            title={
              <ControlListTitle
                icon={<Building2 color="$color11" size={18} />}
                label={model.t("shell.organizations")}
              />
            }
            trailing={<ChevronRight color="$color11" size={18} />}
          />

          <Separator />

          <SheetListRow
            minHeight={56}
            onPress={model.onOpenSettings}
            title={
              <ControlListTitle icon={<Settings2 color="$color11" size={18} />} label={model.t("common.settings")} />
            }
            trailing={<ChevronRight color="$color11" size={18} />}
          />

          <Separator />

          <SheetListRow
            minHeight={56}
            onPress={model.onRequestSignOut}
            title={
              <ControlListTitle
                icon={<LogOut color="$red10" size={18} />}
                label={model.t("settings.signOutLabel")}
                tone="danger"
              />
            }
            trailing={<ChevronRight color="$red10" size={18} />}
          />
        </SectionCard>
      </YStack>
    </ScreenScaffold>
  );
}

function ControlListTitle({
  icon,
  label,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  tone?: "danger" | "default";
}) {
  return (
    <XStack style={{ alignItems: "center", gap: 12, minWidth: 0 }}>
      <View style={{ alignItems: "center", justifyContent: "center", width: 20 }}>{icon}</View>
      <Text color={tone === "danger" ? "$red10" : "$color12"} fontSize="$5" fontWeight="600" numberOfLines={1}>
        {label}
      </Text>
    </XStack>
  );
}
