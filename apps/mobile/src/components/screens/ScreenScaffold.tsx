import { ChevronLeft, X } from "@tamagui/lucide-icons";
import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Paragraph, Text, XStack, YStack, useTheme } from "tamagui";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useAppTheme } from "@/features/theme/AppThemeProvider";
import { getThemeBackgroundAppColor } from "@/lib/theme/tamaguiThemes";

type ScreenScaffoldProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  subtitleLeading?: ReactNode;
  onBack?: () => void;
  backButtonVariant?: "back" | "close";
  actions?: ReactNode;
  scrollable?: boolean;
  titleNumberOfLines?: number;
  titleVariant?: "default" | "compact" | "prominent";
}>;

export type ScreenHeaderProps = {
  actions?: ReactNode;
  backButtonVariant?: "back" | "close";
  contentTopInset?: number;
  leading?: ReactNode;
  onBack?: () => void;
  showSeparator?: boolean;
  subtitle?: string;
  subtitleLeading?: ReactNode;
  title: string;
  titleNumberOfLines?: number;
  titleVariant?: "default" | "compact" | "prominent";
};

export function ScreenHeader({
  actions,
  backButtonVariant = "back",
  contentTopInset = 8,
  leading,
  onBack,
  showSeparator = false,
  subtitle,
  subtitleLeading,
  title,
  titleNumberOfLines,
  titleVariant = "default",
}: ScreenHeaderProps) {
  const theme = useTheme();
  const { t } = useAppLanguage();
  const isCompactTitle = titleVariant === "compact";
  const isProminentTitle = titleVariant === "prominent";
  const BackIcon = backButtonVariant === "close" ? X : ChevronLeft;

  return (
    <>
      <XStack style={{ alignItems: "center", justifyContent: "space-between", paddingTop: contentTopInset }}>
        <XStack style={{ alignItems: "center", flex: 1, gap: 8 }}>
          {leading ??
            (onBack ? (
              <Pressable
                accessibilityLabel={backButtonVariant === "close" ? t("common.close") : t("common.back")}
                accessibilityRole="button"
                hitSlop={8}
                onPress={onBack}
                style={{
                  alignItems: "center",
                  borderRadius: 999,
                  height: 36,
                  justifyContent: "center",
                  width: 36,
                }}
              >
                <BackIcon color="$color11" size={20} />
              </Pressable>
            ) : null)}
          <YStack style={{ flex: 1, gap: 4 }}>
            <Text
              color={isCompactTitle ? "$gray11" : undefined}
              fontSize={isCompactTitle ? "$4" : isProminentTitle ? "$6" : "$9"}
              fontWeight={isCompactTitle ? "500" : "700"}
              numberOfLines={titleNumberOfLines}
            >
              {title}
            </Text>
            {subtitle ? (
              subtitleLeading ? (
                <XStack style={{ alignItems: "center", gap: 6 }}>
                  {subtitleLeading}
                  <Paragraph color="$gray11" numberOfLines={1}>
                    {subtitle}
                  </Paragraph>
                </XStack>
              ) : (
                <Paragraph color="$gray11" numberOfLines={1}>
                  {subtitle}
                </Paragraph>
              )
            ) : null}
          </YStack>
        </XStack>
        {actions}
      </XStack>
      {showSeparator ? <View style={{ backgroundColor: theme.borderColor.val, height: 1, marginTop: 12 }} /> : null}
    </>
  );
}

/** Owns generic mobile screen framing and header composition only. */
export function ScreenScaffold({
  actions,
  backButtonVariant = "back",
  children,
  onBack,
  scrollable = true,
  subtitle,
  subtitleLeading,
  title,
  titleNumberOfLines,
  titleVariant = "default",
}: ScreenScaffoldProps) {
  const theme = useTheme();
  const { resolvedTheme } = useAppTheme();
  const isProminentTitle = titleVariant === "prominent";
  const backgroundColor = getThemeBackgroundAppColor(resolvedTheme);

  const content = isProminentTitle ? (
    <YStack style={{ flex: 1, paddingBottom: 16 }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <ScreenHeader
          actions={actions}
          backButtonVariant={backButtonVariant}
          onBack={onBack}
          showSeparator
          subtitle={subtitle}
          subtitleLeading={subtitleLeading}
          title={title}
          titleNumberOfLines={titleNumberOfLines}
          titleVariant={titleVariant}
        />
      </View>
      <YStack style={{ flex: 1, gap: 16, paddingHorizontal: 16, paddingTop: 16 }}>{children}</YStack>
    </YStack>
  ) : (
    <YStack style={{ flex: 1, gap: 16, paddingBottom: 16, paddingHorizontal: 16 }}>
      <ScreenHeader
        actions={actions}
        backButtonVariant={backButtonVariant}
        onBack={onBack}
        subtitle={subtitle}
        subtitleLeading={subtitleLeading}
        title={title}
        titleNumberOfLines={titleNumberOfLines}
        titleVariant={titleVariant}
      />
      {children}
    </YStack>
  );

  return (
    <SafeAreaView style={{ backgroundColor, flex: 1 }}>
      {scrollable ? <ScrollView>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}
