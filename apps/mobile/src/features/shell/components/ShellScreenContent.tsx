import type { ReactNode } from "react";
import { View } from "react-native";

import { WorkbenchPanelSurface } from "@/components/screens/WorkbenchPanelSurface";
import type { useShellDrawer } from "../hooks/useShellDrawer";
import type { ShellState } from "../state/useShellState";
import type { ShellScreenModel } from "../view-model/useShellScreenModel";
import { ShellFocusPane } from "./ShellFocusPane";

const DRAWER_EDGE_TOUCH_WIDTH = 16;

type ShellScreenContentProps = {
  edgePanHandlers: ReturnType<typeof useShellDrawer>["edgePanHandlers"];
  onRegisterKeyboardDismissHandler?: ((handler: (() => void) | null) => void) | null;
  screenModel: ShellScreenModel;
  shell: ShellState;
};

export function ShellScreenContent({
  edgePanHandlers,
  onRegisterKeyboardDismissHandler,
  screenModel,
  shell,
}: ShellScreenContentProps) {
  return (
    <ShellWorkbenchCenterPaneSurface edgePanHandlers={edgePanHandlers} navOpen={shell.isNavOpen}>
      <ShellFocusPane
        activeTab={shell.activePaneTab}
        chat={screenModel.focusPaneChat}
        onRegisterKeyboardDismissHandler={onRegisterKeyboardDismissHandler}
        onOpenPaneTabs={screenModel.openPaneTabSheet}
        previewContext={screenModel.focusPanePreviewContext}
      />
    </ShellWorkbenchCenterPaneSurface>
  );
}

function ShellWorkbenchCenterPaneSurface({
  children,
  edgePanHandlers,
  navOpen,
}: {
  children: ReactNode;
  edgePanHandlers: ShellScreenContentProps["edgePanHandlers"];
  navOpen: boolean;
}) {
  return (
    <WorkbenchPanelSurface topInset={0}>
      <View
        {...edgePanHandlers}
        pointerEvents={navOpen ? "none" : "box-only"}
        style={{
          bottom: 0,
          left: 0,
          position: "absolute",
          top: 0,
          width: DRAWER_EDGE_TOUCH_WIDTH,
          zIndex: 20,
        }}
      />
      {children}
    </WorkbenchPanelSurface>
  );
}
