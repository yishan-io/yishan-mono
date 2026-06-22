import { Building2, ChevronRight } from "@tamagui/lucide-icons";
import { View } from "react-native";
import { Separator, Text, XStack, YStack, useTheme } from "tamagui";

import { ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { SectionCard } from "@/components/ui/SectionCard";
import { SheetListRow } from "@/components/ui/SheetListRow";
import { useProfileOrganizationsScreenModel } from "../hooks/useProfileOrganizationsScreenModel";

export function ProfileOrganizationsScreen() {
  const model = useProfileOrganizationsScreenModel();

  if (model.organizationsQuery.isLoading) {
    return <LoadingView label={model.t("settings.loading")} />;
  }

  if (model.organizationsQuery.isError) {
    return <ErrorState onRetry={() => model.organizationsQuery.refetch()} />;
  }

  return (
    <ScreenScaffold title={model.t("shell.organizations")} onBack={model.onBack} scrollable={false}>
      <YStack style={{ flex: 1, gap: 16, paddingBottom: 24, paddingTop: 12 }}>
        <SectionCard>
          {model.organizations.map((organization, index) => (
            <View key={organization.id}>
              {index > 0 ? <Separator /> : null}
              <OrganizationListItem
                name={organization.name}
                onPress={() => model.onOpenOrganizationDetails(organization.id, organization.name)}
                organizationLabel={model.t("shell.openOrganizationDetails", {
                  organization: organization.name,
                })}
              />
            </View>
          ))}
        </SectionCard>
      </YStack>
    </ScreenScaffold>
  );
}

function OrganizationListItem({
  name,
  onPress,
  organizationLabel,
}: {
  name: string;
  onPress: () => void;
  organizationLabel: string;
}) {
  return (
    <SheetListRow
      minHeight={56}
      onPress={onPress}
      title={
        <XStack style={{ alignItems: "center", flex: 1, gap: 12, minWidth: 0 }}>
          <View style={{ alignItems: "center", justifyContent: "center", width: 20 }}>
            <Building2 color="$color11" size={18} />
          </View>
          <Text fontSize="$5" fontWeight="600" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
            {name}
          </Text>
        </XStack>
      }
      trailing={<ChevronRight color="$color11" size={18} />}
    />
  );
}
