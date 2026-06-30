import { Button, Paragraph, Text, YStack, useTheme } from "tamagui";

type EmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Owns generic empty-state rendering only. */
export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <YStack
      gap="$3"
      px="$5"
      py="$4"
      style={{ alignItems: "center", backgroundColor: theme.background.val, flex: 1, justifyContent: "center" }}
    >
      <Text color="$color" fontSize="$8" fontWeight="700" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Paragraph color="$gray11" style={{ textAlign: "center" }}>
        {message}
      </Paragraph>
      {actionLabel && onAction ? <Button onPress={onAction} themeInverse>{actionLabel}</Button> : null}
    </YStack>
  );
}
