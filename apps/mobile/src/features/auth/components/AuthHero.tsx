import { Image } from "react-native";
import { Paragraph, Text, YStack } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

const yishanLogo = require("@/assets/yishan-logo.png");

export function AuthHero() {
  const { t } = useAppLanguage();

  return (
    <YStack style={{ alignItems: "center", gap: 18, paddingTop: 28 }}>
      <Image source={yishanLogo} style={{ height: 88, width: 88 }} resizeMode="contain" />
      <YStack style={{ alignItems: "center", gap: 8, maxWidth: 320 }}>
        <Text fontSize={42} fontWeight="800" letterSpacing={0}>
          Yishan
        </Text>
        <Paragraph size="$7" style={{ textAlign: "center" }}>
          {t("auth.tagline")}
        </Paragraph>
      </YStack>
    </YStack>
  );
}
