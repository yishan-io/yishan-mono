import { Paragraph, Spinner, Text, YStack, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

type LoadingViewProps = {
  label?: string;
};

/** Owns generic loading-state rendering only. */
export function LoadingView({ label }: LoadingViewProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();

  return (
    <YStack
      style={{
        alignItems: "center",
        backgroundColor: theme.background.val,
        flex: 1,
        gap: 12,
        justifyContent: "center",
        paddingHorizontal: 20,
      }}
    >
      <Spinner />
      <Text color="$color" fontSize="$6" fontWeight="600">
        {label ?? t("common.loading")}
      </Text>
      <Paragraph color="$gray11" style={{ textAlign: "center" }}>
        {t("errors.wait")}
      </Paragraph>
    </YStack>
  );
}
