import { X } from "@tamagui/lucide-icons";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Text, XStack, YStack } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import type { ShellPaneTab, TerminalMap } from "../state/shell.types";
import { PaneTabSelectorDialogs } from "./PaneTabSelectorDialogs";
import { PaneTabSelectorList } from "./PaneTabSelectorList";
import { usePaneTabSelectorModel } from "./usePaneTabSelectorModel";

type PaneTabSelectorSheetProps = {
  activePaneTabId: string | null;
  onClose: () => void;
  onClosePaneTab: (tabId: string) => void;
  onRenameTerminal: (terminalId: string, nextLabel: string) => void;
  onSelectPaneTab: (tabId: string) => void;
  open: boolean;
  tabs: ShellPaneTab[];
  terminalsById: TerminalMap;
};

export function PaneTabSelectorSheet({
  activePaneTabId,
  onClose,
  onClosePaneTab,
  onRenameTerminal,
  onSelectPaneTab,
  open,
  tabs,
  terminalsById,
}: PaneTabSelectorSheetProps) {
  const { height } = useWindowDimensions();
  const model = usePaneTabSelectorModel({
    activePaneTabId,
    onClose,
    onClosePaneTab,
    onRenameTerminal,
    onSelectPaneTab,
    open,
    tabs,
    terminalsById,
  });

  return (
    <AppModalSheet
      initialSnapPointIndex={1}
      open={open}
      onClose={model.closeSheet}
      position="bottom"
      snapPoints={[92, 58]}
      showHandle
      contentStyle={{ minHeight: height * 0.5, paddingHorizontal: 12 }}
    >
      <View style={{ minHeight: height * 0.5, paddingTop: 6, position: "relative" }}>
        <YStack style={{ gap: 10 }}>
          <XStack style={{ alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 }}>
            <View style={{ width: 32 }} />
            <Text fontSize="$8" fontWeight="700" style={{ textAlign: "center" }}>
              {model.t("shell.focusTabs")}
            </Text>
            <Pressable
              accessibilityLabel={model.t("common.close")}
              onPress={model.closeSheet}
              style={{ alignItems: "center", height: 32, justifyContent: "center", width: 32 }}
            >
              <X color="$color12" size={18} />
            </Pressable>
          </XStack>
          <PaneTabSelectorList
            activePaneTabId={activePaneTabId}
            closeLabel={model.t("shell.closeTab")}
            listRef={model.listRef}
            moreLabel={model.t("common.moreActions")}
            onClosePaneTab={model.closePaneTab}
            onOpenMoreActions={(terminalId) => model.setActionTerminalId(terminalId)}
            onSelectPaneTab={model.selectPaneTab}
            rows={model.paneTabRows}
          />
        </YStack>

        <PaneTabSelectorDialogs
          actionTerminal={model.actionTerminal}
          closeActionDialog={model.closeActionDialog}
          closeRenameDialog={model.closeRenameDialog}
          closeTerminal={(terminalId) => {
            const tab = tabs.find((candidate) => candidate.kind === "terminal" && candidate.terminalId === terminalId);
            if (tab) {
              model.closePaneTab(tab.id);
            }
          }}
          openRenameDialog={model.openRenameDialog}
          renameTerminal={model.renameTerminal}
          renameTitle={model.renameTitle}
          renameValue={model.renameValue}
          setRenameValue={(value) => model.setRenameValue(value)}
          submitRename={model.submitRename}
          t={model.t}
        />
      </View>
    </AppModalSheet>
  );
}
