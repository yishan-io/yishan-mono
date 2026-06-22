import { Paragraph, Spinner, Text, YStack } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

type LoadingViewProps = {
  label?: string;
};

/** Owns generic loading-state rendering only. */
export function LoadingView({ label }: LoadingViewProps) {
  const { t } = useAppLanguage();

  return (
    <YStack style={{ alignItems: "center", flex: 1, gap: 12, justifyContent: "center", paddingHorizontal: 20 }}>
      <Spinner />
      <Text fontSize="$6" fontWeight="600">
        {label ?? t("common.loading")}
      </Text>
      <Paragraph style={{ textAlign: "center" }}>{t("errors.wait")}</Paragraph>
    </YStack>
  );
}
