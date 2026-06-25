import { useIsFocused } from "expo-router";
import { useRef } from "react";
import { View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useAppTheme } from "@/features/theme/AppThemeProvider";
import { dismissActiveKeyboard } from "@/lib/accessibility/dismissActiveKeyboard";
import { getThemeBackgroundAppColor } from "@/lib/theme/tamaguiThemes";
import { ShellScreenContent } from "../components/ShellScreenContent";
import { ShellScreenSheets } from "../components/ShellScreenSheets";
import { useShellScreenRuntime } from "../view-model/useShellScreenRuntime";

export function ShellScreen() {
  const { resolvedTheme } = useAppTheme();
  const { t } = useAppLanguage();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const keyboardDismissHandlerRef = useRef<(() => void) | null>(null);
  const dismissKeyboard = () => {
    keyboardDismissHandlerRef.current?.();
    dismissActiveKeyboard();
  };
  const { drawer, screenContext, screenModel, sheets, shell } = useShellScreenRuntime({
    drawerWidth: width,
    isScreenFocused: isFocused,
    onDismissKeyboard: dismissKeyboard,
    t,
  });

  if (screenContext.isShellLoading) {
    return <LoadingView label={t("shell.loading")} />;
  }

  if (screenContext.isShellError) {
    return <ErrorState onRetry={() => void screenContext.retryShell()} />;
  }

  return (
    <SafeAreaView style={{ backgroundColor: getThemeBackgroundAppColor(resolvedTheme), flex: 1 }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <ShellScreenContent
          closeDrawer={drawer.closeDrawer}
          drawerPanHandlers={drawer.drawerPanHandlers}
          drawerTranslateX={drawer.drawerTranslateX}
          edgePanHandlers={drawer.edgePanHandlers}
          onDismissKeyboard={dismissKeyboard}
          onRegisterKeyboardDismissHandler={(handler) => {
            keyboardDismissHandlerRef.current = handler;
          }}
          openDrawer={drawer.openDrawer}
          overlayOpacity={drawer.overlayOpacity}
          screenModel={screenModel}
          shell={shell}
        />

        <ShellScreenSheets screenContext={screenContext} screenModel={screenModel} sheets={sheets} shell={shell} />
      </View>
    </SafeAreaView>
  );
}
