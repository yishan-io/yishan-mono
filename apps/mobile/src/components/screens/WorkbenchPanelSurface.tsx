import type { PropsWithChildren, ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

import { resolveWorkbenchChromeLayout } from "./workbenchFrameDomain";

type WorkbenchPanelInset = "none" | "panel";

type WorkbenchPanelSurfaceProps = PropsWithChildren<{
  bodyInset?: WorkbenchPanelInset;
  bodyStyle?: ViewStyle;
  gap?: number;
  header?: ReactNode;
  headerInset?: WorkbenchPanelInset;
  topInset?: number;
}>;

export function WorkbenchPanelSurface({
  bodyInset = "none",
  bodyStyle,
  children,
  gap,
  header,
  headerInset = "none",
  topInset,
}: WorkbenchPanelSurfaceProps) {
  const layout = resolveWorkbenchChromeLayout();
  const resolvedGap = gap ?? layout.panelSectionGap;
  const resolvedTopInset = topInset ?? layout.panelTopInset;
  const headerPaddingHorizontal = headerInset === "panel" ? layout.panelHorizontalInset : 0;
  const bodyPaddingHorizontal = bodyInset === "panel" ? layout.panelHorizontalInset : 0;

  return (
    <View
      style={{
        flex: 1,
        gap: header ? resolvedGap : 0,
        minHeight: 0,
        paddingBottom: layout.panelBottomInset,
        paddingTop: resolvedTopInset,
      }}
    >
      {header ? <View style={{ paddingHorizontal: headerPaddingHorizontal }}>{header}</View> : null}
      <View
        style={[
          {
            flex: 1,
            minHeight: 0,
            paddingHorizontal: bodyPaddingHorizontal,
          },
          bodyStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
