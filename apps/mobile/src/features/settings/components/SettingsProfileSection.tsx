import { Image } from "react-native";
import { Paragraph, Text, XStack, YStack } from "tamagui";

import { SectionCard } from "@/components/ui/SectionCard";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { MeUser } from "@/features/me/me.types";

type SettingsProfileSectionProps = {
  user: MeUser;
};

export function SettingsProfileSection({ user }: SettingsProfileSectionProps) {
  const { t } = useAppLanguage();

  return (
    <SectionCard>
      <XStack style={{ alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 }}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ borderRadius: 24, height: 48, width: 48 }} />
        ) : null}
        <YStack style={{ flex: 1, gap: 4 }}>
          <Text fontSize="$7" fontWeight="700">
            {user.name ?? t("settings.profileFallbackName")}
          </Text>
          <Paragraph>{user.email}</Paragraph>
        </YStack>
      </XStack>
    </SectionCard>
  );
}
