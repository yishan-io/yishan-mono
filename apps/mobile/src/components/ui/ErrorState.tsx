import { Button, Paragraph, Text, YStack } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

/** Owns generic error-state rendering only. */
export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useAppLanguage();

  return (
    <YStack style={{ flex: 1, gap: 16, justifyContent: "center", paddingHorizontal: 20 }}>
      <Text fontSize="$9" fontWeight="700">
        {title ?? t("errors.genericTitle")}
      </Text>
      <Paragraph>{message ?? t("errors.genericMessage")}</Paragraph>
      {onRetry ? <Button onPress={onRetry}>{t("common.retry")}</Button> : null}
    </YStack>
  );
}
