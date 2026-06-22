import { Button, Paragraph, Text, YStack } from "tamagui";

type EmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Owns generic empty-state rendering only. */
export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <YStack gap="$3" px="$5" py="$4" style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
      <Text fontSize="$8" fontWeight="700" style={{ textAlign: "center" }}>
        {title}
      </Text>
      <Paragraph style={{ textAlign: "center" }}>{message}</Paragraph>
      {actionLabel && onAction ? <Button onPress={onAction}>{actionLabel}</Button> : null}
    </YStack>
  );
}
