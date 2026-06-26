import { useIsFocused } from "expo-router";
import { useRef } from "react";
import { useWindowDimensions } from "react-native";

import { WorkbenchFrame } from "@/components/screens/WorkbenchFrame";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { dismissActiveKeyboard } from "@/lib/accessibility/dismissActiveKeyboard";
import { ShellDrawer } from "../components/ShellDrawer";
import { ShellTopBar } from "../components/ShellDrawerHeader";
import { ShellScreenContent } from "../components/ShellScreenContent";
import { ShellScreenSheets } from "../components/ShellScreenSheets";
import { useShellScreenRuntime } from "../view-model/useShellScreenRuntime";

export function ShellScreen() {
  const { t } = useAppLanguage();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const drawerWidth = width;
  const keyboardDismissHandlerRef = useRef<(() => void) | null>(null);
  const dismissKeyboard = () => {
    keyboardDismissHandlerRef.current?.();
    dismissActiveKeyboard();
  };
  const { drawer, screenContext, screenModel, sheets, shell } = useShellScreenRuntime({
    drawerWidth,
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
    <WorkbenchFrame
      bodyDensity="flush"
      header={
        <ShellTopBar
          aggregateIndicator={screenModel.drawerTopBar.aggregateIndicator}
          onOpenBrowser={screenModel.drawerTopBar.onOpenBrowser}
          onOpenDrawer={drawer.openDrawer}
          onOpenQuickActions={screenModel.drawerTopBar.onOpenQuickActions}
          onRefreshSessions={screenModel.drawerTopBar.onRefreshSessions}
          refreshingSessions={screenModel.drawerTopBar.refreshingSessions}
          subtitle={screenModel.drawerTopBar.subtitle}
          subtitleLeading={screenModel.drawerTopBar.subtitleLeading}
          title={screenModel.drawerTopBar.title}
        />
      }
      overlay={
        <ShellDrawer
          closeDrawer={drawer.closeDrawer}
          drawerPanHandlers={drawer.drawerPanHandlers}
          drawerTranslateX={drawer.drawerTranslateX}
          drawerWidth={drawerWidth}
          onInteractionStart={dismissKeyboard}
          onSelectWorkspace={screenModel.onSelectWorkspace}
          overlayOpacity={drawer.overlayOpacity}
          panel={screenModel.drawerPanel}
          visible={shell.isNavOpen}
        />
      }
    >
      <>
        <ShellScreenContent
          edgePanHandlers={drawer.edgePanHandlers}
          onRegisterKeyboardDismissHandler={(handler) => {
            keyboardDismissHandlerRef.current = handler;
          }}
          screenModel={screenModel}
          shell={shell}
        />

        <ShellScreenSheets screenContext={screenContext} screenModel={screenModel} sheets={sheets} shell={shell} />
      </>
    </WorkbenchFrame>
  );
}
