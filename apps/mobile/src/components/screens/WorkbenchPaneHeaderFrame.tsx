import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { useTheme } from "tamagui";

import { resolveWorkbenchChromeLayout } from "./workbenchFrameDomain";

/** Owns the shared workbench-pane header frame so left, center, and right surfaces share one chrome height. */
export function WorkbenchPaneHeaderFrame({ children }: PropsWithChildren) {
  const theme = useTheme();
  const layout = resolveWorkbenchChromeLayout();

  return (
    <View
      style={{
        borderBottomColor: theme.borderColor.val,
        borderBottomWidth: 1,
        justifyContent: "center",
        minHeight: layout.headerMinHeight,
        paddingHorizontal: layout.headerHorizontalInset,
      }}
    >
      {children}
    </View>
  );
}
