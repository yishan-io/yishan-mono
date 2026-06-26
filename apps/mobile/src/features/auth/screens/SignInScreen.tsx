import { StyleSheet, View } from "react-native";
import { Paragraph } from "tamagui";

import { AuthEntryActions } from "@/features/auth/components/AuthEntryActions";
import { AuthHero } from "@/features/auth/components/AuthHero";
import { AuthScreenFrame } from "@/features/auth/components/AuthScreenFrame";
import { AuthVersion } from "@/features/auth/components/AuthVersion";
import { useSignInScreenModel } from "@/features/auth/hooks/useSignInScreenModel";

export function SignInScreen() {
  const model = useSignInScreenModel();

  return (
    <AuthScreenFrame backgroundColor={model.backgroundColor}>
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
    </AuthScreenFrame>
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
});
