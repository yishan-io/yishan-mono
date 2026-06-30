import { View } from "react-native";
import { Text, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { TerminalMessage } from "../state/shell.types";

type ShellMessageTimelineItemProps = {
  message: TerminalMessage;
};

export function ShellMessageTimelineItem({ message }: ShellMessageTimelineItemProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderLeftColor: message.status === "error" ? theme.red8.val : theme.gray6.val,
        borderLeftWidth: 3,
        gap: 8,
        marginHorizontal: -16,
        paddingLeft: 13,
        paddingRight: 16,
      }}
    >
      {message.parts.map((part, index) => (
        <SessionMessagePartView key={`${message.id}-part-${index}`} part={part} />
      ))}
    </View>
  );
}

function SessionMessagePartView({ part }: { part: TerminalMessage["parts"][number] }) {
  const { t } = useAppLanguage();
  const theme = useTheme();

  if (part.type === "thinking") {
    return (
      <View
        style={{
          backgroundColor: theme.gray3.val,
          borderColor: theme.gray5.val,
          borderRadius: 14,
          borderWidth: 1,
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text color="$gray11" fontSize="$2" fontWeight="700" textTransform="lowercase">
          {t("shell.thinking")}
        </Text>
        <Text color="$gray11" fontSize="$4" lineHeight={22}>
          {part.text}
        </Text>
      </View>
    );
  }

  if (part.type === "tool_call") {
    return (
      <View
        style={{
          backgroundColor: theme.gray2.val,
          borderColor: theme.gray5.val,
          borderRadius: 14,
          borderWidth: 1,
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text color="$gray11" fontSize="$2" fontWeight="700">
          {part.toolName}
        </Text>
        {part.argumentsText ? (
          <Text color="$gray11" fontSize="$3" lineHeight={20}>
            {part.argumentsText}
          </Text>
        ) : null}
        <Text color="$gray10" fontSize="$2">
          {part.status}
        </Text>
      </View>
    );
  }

  if (part.type === "tool_result") {
    return (
      <View
        style={{
          backgroundColor: part.isError ? theme.red3.val : theme.gray2.val,
          borderColor: theme.gray5.val,
          borderRadius: 14,
          borderWidth: 1,
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text color="$gray11" fontSize="$2" fontWeight="700">
          {part.toolName}
        </Text>
        <Text color="$gray11" fontSize="$3" lineHeight={20}>
          {part.outputText}
        </Text>
      </View>
    );
  }

  return (
    <Text fontSize="$6" lineHeight={28}>
      {part.text}
    </Text>
  );
}
