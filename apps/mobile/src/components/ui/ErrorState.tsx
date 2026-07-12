import { Button, Paragraph, Text, YStack, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

/** Owns generic error-state rendering only. */
export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();

  return (
    <YStack
      style={{
        backgroundColor: theme.background.val,
        flex: 1,
        gap: 16,
        justifyContent: "center",
        paddingHorizontal: 20,
      }}
    >
      <Text color="$color" fontSize="$9" fontWeight="700">
        {title ?? t("errors.genericTitle")}
      </Text>
      <Paragraph color="$gray11">{message ?? t("errors.genericMessage")}</Paragraph>
      {onRetry ? (
        <Button onPress={onRetry} themeInverse>
          {t("common.retry")}
        </Button>
      ) : null}
    </YStack>
  );
}
