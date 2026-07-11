import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AuthScreenFrameProps = PropsWithChildren<{
  backgroundColor: string;
}>;

/** Keeps sign-in framing independent from authenticated app navigation. */
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
