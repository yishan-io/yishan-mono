import { ArrowUp, Plus } from "@tamagui/lucide-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { TextArea, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import {
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MAX_LINES,
  COMPOSER_MIN_HEIGHT,
} from "@/features/shell/state/shell.constants";
import { getSessionComposerLayout } from "./session-composer-domain";

type SessionComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sendDisabled?: boolean;
};

export function SessionComposer({ draft, onDraftChange, onSend, sendDisabled = false }: SessionComposerProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const { composerLineCount, composerTextHeight, hasDraft, isSingleLineComposer } = getSessionComposerLayout(draft);

  return (
    <View
      style={{
        alignItems: isSingleLineComposer ? "center" : "flex-end",
        borderColor: theme.gray5.val,
        borderRadius: 20,
        borderWidth: 1,
        flexDirection: "row",
        gap: 8,
        minHeight: COMPOSER_MIN_HEIGHT,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <IconActionButton
        accessibilityLabel={t("shell.attach")}
        disabled={sendDisabled}
        icon={<Plus color="$gray11" size={18} />}
      />
      <TextArea
        unstyled
        multiline
        onChangeText={onDraftChange}
        placeholder={t("shell.terminalInputPlaceholder")}
        scrollEnabled={composerLineCount >= COMPOSER_MAX_LINES}
        style={{
          color: theme.color12.val,
          flex: 1,
          fontSize: 18,
          height: composerTextHeight,
          lineHeight: COMPOSER_LINE_HEIGHT,
          maxHeight: COMPOSER_MAX_HEIGHT - 16,
          minHeight: COMPOSER_LINE_HEIGHT,
          paddingBottom: 0,
          paddingTop: 0,
          textAlignVertical: isSingleLineComposer ? "center" : "top",
        }}
        value={draft}
      />
      {hasDraft ? (
        sendDisabled ? (
          <View style={{ opacity: 0.4 }}>
            <ComposerSendButton />
          </View>
        ) : (
          <ComposerSendButton onPress={onSend} />
        )
      ) : null}
    </View>
  );
}

function ComposerSendButton({ onPress }: { onPress?: () => void }) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const disabled = !onPress;

  return (
    <Pressable
      accessibilityLabel={t("shell.send")}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: theme.color12.val,
        borderRadius: 999,
        height: 32,
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        width: 32,
      })}
    >
      <ArrowUp color="$color1" size={16} />
    </Pressable>
  );
}

function IconActionButton({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 999,
        height: 32,
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        width: 32,
      })}
    >
      {icon}
    </Pressable>
  );
}
