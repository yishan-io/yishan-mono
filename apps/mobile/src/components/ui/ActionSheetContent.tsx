import { StyleSheet, View } from "react-native";
import { Button, Text } from "tamagui";

import { MOBILE_UI_TOKENS } from "./ui-tokens";

type ActionSheetContentProps = {
  actions: Array<{
    destructive?: boolean;
    disabled?: boolean;
    label: string;
    onPress: () => void;
  }>;
  title: string;
};

/** Owns the shared content layout for bottom-sheet action menus. */
export function ActionSheetContent({ actions, title }: ActionSheetContentProps) {
  return (
    <View style={styles.root}>
      {title ? (
        <Text fontSize="$7" fontWeight="700" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {actions.map((action) => (
          <Button
            key={action.label}
            disabled={action.disabled}
            onPress={action.onPress}
            themeInverse={!action.destructive}
          >
            {action.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 8,
  },
  root: {
    gap: 12,
    minHeight: MOBILE_UI_TOKENS.sheet.actionMenuMinHeight,
  },
});
