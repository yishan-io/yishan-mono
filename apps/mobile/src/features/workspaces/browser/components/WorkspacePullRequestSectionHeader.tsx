import { RefreshCw } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { Button, Text, XStack, useTheme } from "tamagui";

type WorkspacePullRequestSectionHeaderProps = {
  disabled?: boolean;
  onRefresh?: (() => void) | null;
  refreshingLabel?: string;
  refreshLabel?: string;
  title: string;
  trailing?: ReactNode;
};

export function WorkspacePullRequestSectionHeader({
  disabled = false,
  onRefresh,
  refreshingLabel,
  refreshLabel,
  title,
  trailing,
}: WorkspacePullRequestSectionHeaderProps) {
  const theme = useTheme();

  const action =
    trailing ??
    (onRefresh && refreshLabel && refreshingLabel ? (
      <Button chromeless disabled={disabled} icon={RefreshCw} onPress={onRefresh} size="$2" theme="gray">
        {disabled ? refreshingLabel : refreshLabel}
      </Button>
    ) : null);

  return (
    <XStack
      style={{
        alignItems: "center",
        backgroundColor: theme.background.val,
        justifyContent: "space-between",
        paddingBottom: 8,
        paddingHorizontal: 16,
        paddingTop: 16,
      }}
    >
      <Text fontSize="$4" fontWeight="700">
        {title}
      </Text>
      {action}
    </XStack>
  );
}
