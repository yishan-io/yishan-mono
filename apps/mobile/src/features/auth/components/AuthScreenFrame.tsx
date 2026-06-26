import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AuthScreenFrameProps = PropsWithChildren<{
  backgroundColor: string;
}>;

/**
 * Auth lives outside the three-pane workbench shell. Keep its framing explicit
 * so sign-in does not inherit workbench header/body assumptions by accident.
 */
export function AuthScreenFrame({ backgroundColor, children }: AuthScreenFrameProps) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
