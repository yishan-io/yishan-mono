import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, View, type ViewStyle } from "react-native";
import { Paragraph, useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "./ui-tokens";

type PaneBodyProps = PropsWithChildren<{
  gap?: number;
  style?: ViewStyle;
}>;

type PaneBodyScrollViewProps = PropsWithChildren<{
  gap?: number;
  style?: ViewStyle;
  topPadding?: number;
}>;

/** Owns shared pane body spacing for non-scroll content. */
export function PaneBody({ children, gap, style }: PaneBodyProps) {
  return (
    <View
      style={[
        {
          flex: 1,
          paddingBottom: MOBILE_UI_TOKENS.pane.bodyBottom,
          paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX,
          paddingTop: MOBILE_UI_TOKENS.pane.bodyTop,
        },
        gap !== undefined ? { gap } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Owns shared pane body spacing for scrollable content. */
export function PaneBodyScrollView({ children, gap, style, topPadding }: PaneBodyScrollViewProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={[{ backgroundColor: theme.background.val }, style]}
      contentContainerStyle={{
        gap,
        paddingBottom: MOBILE_UI_TOKENS.pane.bodyBottom,
        paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX,
        paddingTop: topPadding ?? MOBILE_UI_TOKENS.pane.bodyTop,
      }}
    >
      {children}
    </ScrollView>
  );
}

/** Owns shared inline pane notice rendering only. */
export function PaneBodyNotice({
  children,
  topPadding = MOBILE_UI_TOKENS.pane.bodyTop,
}: {
  children: ReactNode;
  topPadding?: number;
}) {
  return (
    <Paragraph
      color="$yellow10"
      style={{
        paddingBottom: MOBILE_UI_TOKENS.pane.noticeBottom,
        paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX,
        paddingTop: topPadding,
      }}
    >
      {children}
    </Paragraph>
  );
}
