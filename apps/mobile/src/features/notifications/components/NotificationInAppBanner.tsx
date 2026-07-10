import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "tamagui";

import type { InAppNotificationBanner } from "../notification-runtime-helpers";

type NotificationInAppBannerProps = {
  banner: InAppNotificationBanner;
  onPress: () => void;
};

export function NotificationInAppBanner({ banner, onPress }: NotificationInAppBannerProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.container, { top: insets.top + 12 }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.background.val,
            borderColor: theme.borderColor.val,
            shadowColor: theme.color1.val,
          },
        ]}
      >
        <Text numberOfLines={1} style={[styles.title, { color: theme.color12.val }]}>
          {banner.title}
        </Text>
        <Text numberOfLines={2} style={[styles.body, { color: theme.color11.val }]}>
          {banner.body}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    elevation: 10,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
  },
  container: {
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 1000,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
});
