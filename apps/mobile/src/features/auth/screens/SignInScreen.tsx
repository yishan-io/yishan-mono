import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Paragraph } from "tamagui";

import { AuthEntryActions } from "@/features/auth/components/AuthEntryActions";
import { AuthHero } from "@/features/auth/components/AuthHero";
import { AuthVersion } from "@/features/auth/components/AuthVersion";
import { useSignInScreenModel } from "@/features/auth/hooks/useSignInScreenModel";

export function SignInScreen() {
  const model = useSignInScreenModel();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: model.backgroundColor }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.page}>
          <AuthHero />

          <AuthEntryActions
            googleAvailable={model.googleAvailable}
            googleLoading={model.googleLoading}
            onContinueWithGoogle={model.startGoogle}
          />

          {model.authError ? (
            <Paragraph color="$red10" style={styles.authError}>
              {model.authError}
            </Paragraph>
          ) : null}

          <AuthVersion version={model.version} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authError: {
    marginTop: 16,
    textAlign: "center",
  },
  page: {
    flex: 1,
    justifyContent: "space-between",
    minHeight: "100%",
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
