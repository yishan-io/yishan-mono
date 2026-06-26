import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";

type WorkbenchSecondaryBarFrameProps = PropsWithChildren<{
  showBottomShadow?: boolean;
}>;

/** Owns the shared secondary-bar rhythm that sits below a pane header without promoting itself into header chrome. */
export function WorkbenchSecondaryBarFrame({ children, showBottomShadow = false }: WorkbenchSecondaryBarFrameProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.background.val,
        elevation: showBottomShadow ? 4 : 0,
        justifyContent: "center",
        minHeight: MOBILE_UI_TOKENS.pane.secondaryBarMinHeight,
        paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX,
        paddingVertical: MOBILE_UI_TOKENS.pane.secondaryBarInsetY,
        shadowColor: showBottomShadow ? "#0f172a" : "transparent",
        shadowOffset: showBottomShadow ? { width: 0, height: 4 } : { width: 0, height: 0 },
        shadowOpacity: showBottomShadow ? 0.08 : 0,
        shadowRadius: showBottomShadow ? 10 : 0,
        zIndex: showBottomShadow ? 1 : 0,
      }}
    >
      {children}
    </View>
  );
}
