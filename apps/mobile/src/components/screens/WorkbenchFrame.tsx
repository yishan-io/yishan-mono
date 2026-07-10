import type { PropsWithChildren, ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/features/theme/AppThemeProvider";
import { getThemeBackgroundAppColor } from "@/lib/theme/tamaguiThemes";
import { ScreenHeader, type ScreenHeaderProps } from "./ScreenScaffold";
import { WorkbenchPaneHeaderFrame } from "./WorkbenchPaneHeaderFrame";
import { type WorkbenchBodyDensity, resolveWorkbenchFrameLayout } from "./workbenchFrameDomain";

type WorkbenchFrameProps = PropsWithChildren<{
  bodyDensity?: WorkbenchBodyDensity;
  header: ReactNode;
  overlay?: ReactNode;
}>;

type WorkbenchHeaderProps = Omit<ScreenHeaderProps, "showSeparator" | "titleVariant">;

export function WorkbenchHeader(props: WorkbenchHeaderProps) {
  return (
    <WorkbenchPaneHeaderFrame>
      <ScreenHeader {...props} contentTopInset={0} titleVariant="prominent" />
    </WorkbenchPaneHeaderFrame>
  );
}

export function WorkbenchFrame({ bodyDensity = "flush", children, header, overlay }: WorkbenchFrameProps) {
  const { resolvedTheme } = useAppTheme();
  const layout = resolveWorkbenchFrameLayout(bodyDensity);

  return (
    <SafeAreaView style={{ backgroundColor: getThemeBackgroundAppColor(resolvedTheme), flex: 1 }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {header}
        <View
          style={{
            flex: 1,
            minHeight: 0,
            paddingBottom: layout.bodyBottomInset,
            paddingHorizontal: layout.bodyHorizontalInset,
            paddingTop: layout.bodyTopInset,
          }}
        >
          {children}
        </View>
        {overlay}
      </View>
    </SafeAreaView>
  );
}
