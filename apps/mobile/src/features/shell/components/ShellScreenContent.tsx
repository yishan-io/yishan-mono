import { View } from "react-native";

import type { useShellDrawer } from "../hooks/useShellDrawer";
import type { ShellState } from "../state/useShellState";
import type { ShellScreenModel } from "../view-model/useShellScreenModel";
import { ShellDrawer } from "./ShellDrawer";
import { ShellFocusPane } from "./ShellFocusPane";

type ShellScreenContentProps = {
  closeDrawer: ReturnType<typeof useShellDrawer>["closeDrawer"];
  drawerPanHandlers: ReturnType<typeof useShellDrawer>["drawerPanHandlers"];
  drawerTranslateX: ReturnType<typeof useShellDrawer>["drawerTranslateX"];
  edgePanHandlers: ReturnType<typeof useShellDrawer>["edgePanHandlers"];
  openDrawer: ReturnType<typeof useShellDrawer>["openDrawer"];
  overlayOpacity: ReturnType<typeof useShellDrawer>["overlayOpacity"];
  screenModel: ShellScreenModel;
  shell: ShellState;
};

export function ShellScreenContent({
  closeDrawer,
  drawerPanHandlers,
  drawerTranslateX,
  edgePanHandlers,
  openDrawer,
  overlayOpacity,
  screenModel,
  shell,
}: ShellScreenContentProps) {
  return (
    <>
      <ShellDrawer
        closeDrawer={closeDrawer}
        drawerPanHandlers={drawerPanHandlers}
        drawerTranslateX={drawerTranslateX}
        onSelectWorkspace={screenModel.onSelectWorkspace}
        openDrawer={openDrawer}
        overlayOpacity={overlayOpacity}
        panel={screenModel.drawerPanel}
        topBar={screenModel.drawerTopBar}
        visible={shell.isNavOpen}
      />

      <View style={{ flex: 1, minHeight: 0 }}>
        <View
          {...edgePanHandlers}
          pointerEvents={shell.isNavOpen ? "none" : "box-only"}
          style={{
            bottom: 0,
            left: 0,
            position: "absolute",
            top: 0,
            width: 40,
            zIndex: 20,
          }}
        />

        <ShellFocusPane
          activeTab={shell.activePaneTab}
          chat={screenModel.focusPaneChat}
          onOpenPaneTabs={screenModel.openPaneTabSheet}
          previewContext={screenModel.focusPanePreviewContext}
        />
      </View>
    </>
  );
}
