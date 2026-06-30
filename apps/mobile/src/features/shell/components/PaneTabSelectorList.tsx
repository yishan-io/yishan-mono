import { FileText, GitCompare, SquareTerminal } from "@tamagui/lucide-icons";
import type * as React from "react";
import type { GestureResponderEvent, ListRenderItemInfo } from "react-native";
import { Pressable, View } from "react-native";
import { SwipeListView, SwipeRow } from "react-native-swipe-list-view";
import { Text, XStack, useTheme } from "tamagui";

import { SheetListRow } from "@/components/ui/SheetListRow";
import type { PaneTabListRow } from "./usePaneTabSelectorModel";
import { SWIPE_ACTION_WIDTH } from "./usePaneTabSelectorModel";

type PaneTabSelectorListProps = {
  activePaneTabId: string | null;
  closeLabel: string;
  listRef: React.MutableRefObject<{ closeAllOpenRows?: () => void } | null>;
  moreLabel: string;
  onClosePaneTab: (tabId: string) => void;
  onOpenMoreActions: (terminalId: string) => void;
  onSelectPaneTab: (tabId: string) => void;
  rows: PaneTabListRow[];
};

const SwipeRowComponent = SwipeRow as React.ComponentType<
  React.PropsWithChildren<{
    closeOnRowPress?: boolean;
    disableRightSwipe?: boolean;
    recalculateHiddenLayout?: boolean;
    rightOpenValue?: number;
    stopRightSwipe?: number;
  }>
>;

export function PaneTabSelectorList({
  activePaneTabId,
  closeLabel,
  listRef,
  moreLabel,
  onClosePaneTab,
  onOpenMoreActions,
  onSelectPaneTab,
  rows,
}: PaneTabSelectorListProps) {
  const theme = useTheme();

  return (
    <SwipeListView
      closeOnRowBeginSwipe
      closeOnRowOpen
      data={rows}
      disableRightSwipe
      keyExtractor={(item) => item.key}
      listViewRef={(ref) => {
        listRef.current = ref;
      }}
      renderItem={({ item, index }: ListRenderItemInfo<PaneTabListRow>) => {
        const tab = item.tab;
        const TabIcon = tab.kind === "terminal" ? SquareTerminal : tab.kind === "diff" ? GitCompare : FileText;

        return (
          <SwipeRowComponent
            closeOnRowPress
            disableRightSwipe
            recalculateHiddenLayout
            rightOpenValue={item.rightOpenValue}
            stopRightSwipe={item.rightOpenValue}
          >
            <SwipeActions
              closeLabel={closeLabel}
              moreLabel={moreLabel}
              onClose={() => onClosePaneTab(tab.id)}
              onMore={() => {
                if (tab.kind === "terminal") {
                  onOpenMoreActions(tab.terminalId);
                }
              }}
              showMore={tab.kind === "terminal"}
            />
            <View
              style={{
                backgroundColor: theme.background.val,
                borderBottomColor: index === rows.length - 1 ? "transparent" : theme.gray4.val,
                borderBottomWidth: 1,
              }}
            >
              <SheetListRow
                active={tab.id === activePaneTabId}
                activeStyle="row"
                leading={<TabIcon size={15} color="$color11" />}
                meta={item.typeLabel}
                minHeight={68}
                onPress={() => onSelectPaneTab(tab.id)}
                title={item.label}
              />
            </View>
          </SwipeRowComponent>
        );
      }}
      scrollEnabled={rows.length > 5}
      useFlatList
    />
  );
}

function SwipeActions({
  closeLabel,
  moreLabel,
  onClose,
  onMore,
  showMore,
}: {
  closeLabel: string;
  moreLabel: string;
  onClose: () => void;
  onMore: () => void;
  showMore: boolean;
}) {
  const theme = useTheme();

  return (
    <XStack
      style={{
        alignItems: "stretch",
        gap: 0,
        justifyContent: "flex-end",
        minHeight: 68,
      }}
    >
      {showMore ? <SwipeActionButton backgroundColor={theme.gray8.val} label={moreLabel} onPress={onMore} /> : null}
      <SwipeActionButton backgroundColor={theme.red9.val} label={closeLabel} onPress={onClose} />
    </XStack>
  );
}

function SwipeActionButton({
  backgroundColor,
  label,
  onPress,
}: {
  backgroundColor: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        alignItems: "center",
        backgroundColor,
        height: "100%",
        justifyContent: "center",
        width: SWIPE_ACTION_WIDTH,
      }}
    >
      <Text color="$color12" fontSize="$3" fontWeight="700" style={{ textAlign: "center" }}>
        {label}
      </Text>
    </Pressable>
  );
}
