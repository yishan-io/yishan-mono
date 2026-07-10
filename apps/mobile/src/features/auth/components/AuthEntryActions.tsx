import { FontAwesome } from "@expo/vector-icons";
import { Button, YStack, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";

type AuthEntryActionsProps = {
  googleAvailable?: boolean;
  googleLoading?: boolean;
  onContinueWithGoogle: () => void;
};

export function AuthEntryActions({
  googleAvailable = true,
  googleLoading = false,
  onContinueWithGoogle,
}: AuthEntryActionsProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();

  return (
    <YStack style={{ gap: 14, marginTop: 36 }}>
      <Button
        size="$6"
        themeInverse
        onPress={onContinueWithGoogle}
        disabled={googleLoading || !googleAvailable}
        icon={googleLoading ? undefined : <FontAwesome name="google" size={18} color={theme.color1.val} />}
      >
        {googleLoading
          ? t("auth.googleSigningIn")
          : googleAvailable
            ? t("auth.continueWithGoogle")
            : t("auth.googleUnavailable")}
      </Button>
    </YStack>
  );
}
