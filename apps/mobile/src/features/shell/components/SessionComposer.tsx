import { ArrowUp, Plus } from "@tamagui/lucide-icons";
import {
  type ElementRef,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Pressable, View } from "react-native";
import { TextArea, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import {
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MAX_LINES,
  COMPOSER_MIN_HEIGHT,
} from "@/features/shell/state/shell.constants";
import { getSessionComposerLayout } from "../domain/session-composer-domain";

const COMPACT_COMPOSER_MIN_HEIGHT = 44;
const COMPACT_COMPOSER_RADIUS = 16;
const COMPACT_COMPOSER_HORIZONTAL_PADDING = 10;
const COMPACT_COMPOSER_VERTICAL_PADDING = 6;
const COMPACT_COMPOSER_GAP = 6;
const COMPACT_COMPOSER_FONT_SIZE = 16;
const COMPACT_COMPOSER_MAX_HEIGHT_OFFSET = 12;
const COMPACT_COMPOSER_SEND_BUTTON_SIZE = 28;

/**
 * Exposes imperative focus controls for the native terminal composer input.
 */
export type SessionComposerHandle = {
  blur: () => void;
  focus: () => void;
};

type SessionComposerProps = {
  compact?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (draft: string) => void;
  sendDisabled?: boolean;
  showLeadingAction?: boolean;
};

export const SessionComposer = forwardRef<SessionComposerHandle, SessionComposerProps>(function SessionComposer(
  { compact = false, draft, onDraftChange, onSend, sendDisabled = false, showLeadingAction = true },
  ref,
) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const [composerDraft, setComposerDraft] = useState(draft);
  const composerInputRef = useRef<ElementRef<typeof TextArea> | null>(null);

  useEffect(() => {
    setComposerDraft(draft);
  }, [draft]);

  useImperativeHandle(
    ref,
    () => ({
      blur: () => {
        composerInputRef.current?.blur();
      },
      focus: () => {
        composerInputRef.current?.focus();
      },
    }),
    [],
  );

  const handleComposerDraftChange = useCallback(
    (value: string) => {
      setComposerDraft(value);
      onDraftChange(value);
    },
    [onDraftChange],
  );

  const handleSendPress = useCallback(() => {
    if (!composerDraft.trim()) {
      return;
    }

    setComposerDraft("");
    onDraftChange("");
    onSend(composerDraft);
  }, [composerDraft, onDraftChange, onSend]);

  const { composerLineCount, composerTextHeight, hasDraft, isSingleLineComposer } =
    getSessionComposerLayout(composerDraft);
  const composerMinHeight = compact ? COMPACT_COMPOSER_MIN_HEIGHT : COMPOSER_MIN_HEIGHT;
  const composerRadius = compact ? COMPACT_COMPOSER_RADIUS : 20;
  const composerGap = compact ? COMPACT_COMPOSER_GAP : 8;
  const composerHorizontalPadding = compact ? COMPACT_COMPOSER_HORIZONTAL_PADDING : 12;
  const composerVerticalPadding = compact ? COMPACT_COMPOSER_VERTICAL_PADDING : 8;
  const composerFontSize = compact ? COMPACT_COMPOSER_FONT_SIZE : 18;
  const composerTextMaxHeight = compact
    ? COMPOSER_MAX_HEIGHT - COMPACT_COMPOSER_MAX_HEIGHT_OFFSET
    : COMPOSER_MAX_HEIGHT - 16;
  const sendButtonSize = compact ? COMPACT_COMPOSER_SEND_BUTTON_SIZE : 32;

  return (
    <View
      style={{
        alignItems: isSingleLineComposer ? "center" : "flex-end",
        borderColor: theme.gray5.val,
        borderRadius: composerRadius,
        borderWidth: 1,
        flexDirection: "row",
        gap: composerGap,
        minHeight: composerMinHeight,
        paddingHorizontal: composerHorizontalPadding,
        paddingVertical: composerVerticalPadding,
      }}
    >
      {showLeadingAction ? (
        <IconActionButton
          accessibilityLabel={t("shell.attach")}
          disabled={sendDisabled}
          icon={<Plus color="$gray11" size={18} />}
        />
      ) : null}
      <TextArea
        ref={composerInputRef}
        unstyled
        multiline
        onChangeText={handleComposerDraftChange}
        placeholder={t("shell.terminalInputPlaceholder")}
        scrollEnabled={composerLineCount >= COMPOSER_MAX_LINES}
        style={{
          color: theme.color12.val,
          flex: 1,
          fontSize: composerFontSize,
          height: composerTextHeight,
          lineHeight: COMPOSER_LINE_HEIGHT,
          maxHeight: composerTextMaxHeight,
          minHeight: COMPOSER_LINE_HEIGHT,
          paddingBottom: 0,
          paddingTop: 0,
          textAlignVertical: isSingleLineComposer ? "center" : "top",
        }}
        value={composerDraft}
      />
      {hasDraft ? (
        sendDisabled ? (
          <View style={{ opacity: 0.4 }}>
            <ComposerSendButton size={sendButtonSize} />
          </View>
        ) : (
          <ComposerSendButton onPress={handleSendPress} size={sendButtonSize} />
        )
      ) : null}
    </View>
  );
});

function ComposerSendButton({ onPress, size = 32 }: { onPress?: () => void; size?: number }) {
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
        height: size,
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        width: size,
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
