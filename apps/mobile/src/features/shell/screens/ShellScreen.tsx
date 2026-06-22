import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingView } from "@/components/ui/LoadingView";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useAppTheme } from "@/features/theme/AppThemeProvider";
import { getThemeBackgroundAppColor } from "@/lib/theme/tamaguiThemes";
import { useShellMutations } from "../commands/useShellMutations";
import { ShellScreenContent } from "../components/ShellScreenContent";
import { ShellScreenSheets } from "../components/ShellScreenSheets";
import { useShellDrawer } from "../hooks/useShellDrawer";
import { useShellSheets } from "../hooks/useShellSheets";
import { resetShellUiFocusState, setShellUiFocusState } from "../state/shellUiFocusStore";
import { useShellState } from "../state/useShellState";
import { useShellScreenContext } from "../view-model/useShellScreenContext";
import { useShellScreenModel } from "../view-model/useShellScreenModel";
import { useShellTerminalMessagesModel } from "../view-model/useShellTerminalMessagesModel";

export function ShellScreen() {
  const { resolvedTheme } = useAppTheme();
  const { t } = useAppLanguage();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const shell = useShellState({ isScreenFocused: isFocused });
  const [isPaneTabSheetOpen, setPaneTabSheetOpen] = useState(false);

  const {
    closeDrawer,
    dismissDrawer,
    drawerPanHandlers,
    drawerTranslateX,
    edgePanHandlers,
    openDrawer,
    overlayOpacity,
  } = useShellDrawer({
    drawerWidth: width,
    isNavOpen: shell.isNavOpen,
    setNavOpen: shell.setNavOpen,
  });

  const sheets = useShellSheets();
  const terminalMessages = useShellTerminalMessagesModel(shell);

  const mutations = useShellMutations({
    onProjectDeleted: ({ organizationId, projectId, workspaceIds }) => {
      const projectTerminals = Object.values(shell.terminalsByWorkspaceId)
        .flat()
        .filter((terminal) => terminal.orgId === organizationId && terminal.projectId === projectId);

      for (const terminal of projectTerminals) {
        terminalMessages.closeTerminal(terminal);
      }

      sheets.closeProjectMenu();
      shell.dropProjectState({ organizationId, projectId, workspaceIds });
    },
    onWorkspaceClosed: ({ organizationId, workspace }) => {
      const workspaceTerminals = [...(shell.terminalsByWorkspaceId[workspace.id] ?? [])];
      for (const terminal of workspaceTerminals) {
        terminalMessages.closeTerminal(terminal);
      }

      sheets.closeWorkspaceMenu();
      shell.dropWorkspaceState({ organizationId, projectId: workspace.projectId, workspaceId: workspace.id });
    },
  });
  const screenContext = useShellScreenContext({
    shell,
    t,
    terminalMessages,
  });
  const screenModel = useShellScreenModel({
    closeDrawer,
    dismissDrawer,
    mutations,
    sheets,
    shell,
    paneTabSheet: {
      close: () => setPaneTabSheetOpen(false),
      isOpen: isPaneTabSheetOpen,
      open: () => setPaneTabSheetOpen(true),
    },
    t,
    terminalMessages,
    screenContext,
  });

  useEffect(() => {
    setShellUiFocusState({
      hasBlockingOverlay:
        shell.isNavOpen ||
        screenModel.isPaneTabSheetOpen ||
        sheets.quickActionsOpen ||
        sheets.orgSelectorOpen ||
        !!sheets.projectCreateOrganizationId ||
        !!sheets.projectMenuProject ||
        !!sheets.workspaceCreateProject ||
        !!sheets.workspaceMenuContext,
      isDrawerOpen: shell.isNavOpen,
      isPaneTabSheetOpen: screenModel.isPaneTabSheetOpen,
    });

    return () => {
      resetShellUiFocusState();
    };
  }, [
    screenModel.isPaneTabSheetOpen,
    shell.isNavOpen,
    sheets.quickActionsOpen,
    sheets.orgSelectorOpen,
    sheets.projectCreateOrganizationId,
    sheets.projectMenuProject,
    sheets.workspaceCreateProject,
    sheets.workspaceMenuContext,
  ]);

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
          closeDrawer={closeDrawer}
          drawerPanHandlers={drawerPanHandlers}
          drawerTranslateX={drawerTranslateX}
          edgePanHandlers={edgePanHandlers}
          openDrawer={openDrawer}
          overlayOpacity={overlayOpacity}
          screenModel={screenModel}
          shell={shell}
        />

        <ShellScreenSheets screenContext={screenContext} screenModel={screenModel} sheets={sheets} shell={shell} />
      </View>
    </SafeAreaView>
  );
}
