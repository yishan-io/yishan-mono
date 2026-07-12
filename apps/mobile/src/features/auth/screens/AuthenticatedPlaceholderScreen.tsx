import { StyleSheet, View } from "react-native";
import { Button, Paragraph, Text, YStack } from "tamagui";

import { ScreenScaffold } from "@/components/screens/ScreenScaffold";
import { useAuth } from "@/features/auth/auth-context";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

export function AuthenticatedPlaceholderScreen() {
  const { signOut } = useAuth();
  const { t } = useAppLanguage();

  return (
    <ScreenScaffold title="Yishan Mobile">
      <View style={styles.page}>
        <YStack gap="$4">
          <Text color="$color12" fontSize="$8" fontWeight="700">
            Yishan Mobile
          </Text>
          <Paragraph color="$color11">{t("auth.signedInPlaceholder")}</Paragraph>
        </YStack>

        <Button chromeless onPress={() => void signOut()}>
          {t("auth.signOut")}
        </Button>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "space-between",
    padding: 24,
  },
});
