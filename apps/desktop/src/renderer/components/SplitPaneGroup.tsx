import { Box, darken } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import type { PaneLeaf } from "../store/split-pane";
import { type SplitDropRegion, SplitDropZone } from "./SplitDropZone";
import { TabBar, type TabBarCreateOption } from "./TabBar";

type TabDescriptor = {
  id: string;
  title: string;
  pinned: boolean;
  kind?: string;
  isDirty?: boolean;
  isTemporary?: boolean;
};

export type SplitPaneGroupProps = {
  pane: PaneLeaf;
  isActive: boolean;
  tabs: TabDescriptor[];
  /** Whether a tab drag is in progress (enables split drop targets). */
  isDraggingSplit: boolean;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseAllTabs?: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onReorderTab?: (paneId: string, draggedTabId: string, targetTabId: string, position: "before" | "after") => void;
  onCreateTab: (option: TabBarCreateOption) => void;
  onRenameTab: (tabId: string, title: string) => void;
  onSplitDrop: (tabId: string, targetPaneId: string, region: SplitDropRegion) => void;
  onSplitRight?: (paneId: string) => void;
  onSplitDown?: (paneId: string) => void;
  onFocusPane: (paneId: string) => void;
  /** Called when a tab drag starts - used to enable split drop targets. */
  onTabDragStart?: (tabId: string) => void;
  /** Called when a tab drag ends. */
  onTabDragEnd?: () => void;
  getTabIcon?: (tab: TabDescriptor) => ReactNode;
  enabledAgentKinds?: Array<import("../helpers/agentSettings").DesktopAgentKind>;
  disabled?: boolean;
  onContentPlaceholderChange?: (paneId: string, placeholder: HTMLDivElement | null) => void;
  /** Renders tab content for the selected tab. */
  renderContent: (pane: PaneLeaf, placeholder: HTMLDivElement | null) => ReactNode;
};

const paneHeaderSx = {
  minHeight: 38,
  px: 1.5,
  position: "relative",
  display: "flex",
  alignItems: "center",
  "&::after": {
    content: '""',
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "1px",
    bgcolor: "divider",
    zIndex: 0,
  },
} as const;

/**
 * Renders one pane within the split layout.
 *
 * Each pane group has its own tab bar and content area. It supports:
 * - Tab selection, close, reorder, rename, pin
 * - Split drop zones for creating new panes via drag
 * - Active pane focus indication
 */
export function SplitPaneGroup({
  pane,
  isActive,
  tabs,
  isDraggingSplit,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onTogglePinTab,
  onReorderTab,
  onCreateTab,
  onRenameTab,
  onSplitDrop,
  onSplitRight,
  onSplitDown,
  onFocusPane,
  onTabDragStart,
  onTabDragEnd,
  getTabIcon,
  enabledAgentKinds,
  disabled,
  onContentPlaceholderChange,
  renderContent,
}: SplitPaneGroupProps) {
  const [draggingTabId, setDraggingTabId] = useState<string>("");
  const [contentPlaceholder, setContentPlaceholder] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    onContentPlaceholderChange?.(pane.id, contentPlaceholder);
  }, [onContentPlaceholderChange, pane.id, contentPlaceholder]);

  const handleSelectTab = useCallback(
    (tabId: string) => {
      onSelectTab(pane.id, tabId);
    },
    [pane.id, onSelectTab],
  );

  const handleReorderTab = useCallback(
    (draggedTabId: string, targetTabId: string, position: "before" | "after") => {
      onReorderTab?.(pane.id, draggedTabId, targetTabId, position);
    },
    [pane.id, onReorderTab],
  );

  const handleSplitDrop = useCallback(
    (paneId: string, region: SplitDropRegion, draggedTabId: string) => {
      const tabId = draggedTabId || draggingTabId;
      if (!tabId) return;
      onSplitDrop(tabId, paneId, region);
      setDraggingTabId("");
    },
    [draggingTabId, onSplitDrop],
  );

  const handlePaneClick = useCallback(() => {
    if (!isActive) {
      onFocusPane(pane.id);
    }
  }, [isActive, pane.id, onFocusPane]);

  const hasTabs = tabs.length > 0;

  return (
    <Box
      data-testid={`split-pane-${pane.id}`}
      onClick={handlePaneClick}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Box
        sx={{
          ...paneHeaderSx,
          minWidth: 0,
          ...(hasTabs
            ? {
                bgcolor: (theme: Theme) =>
                  darken(theme.palette.background.default, 0.2),
              }
            : {}),
        }}
      >
        <TabBar
          tabs={tabs}
          selectedTabId={pane.selectedTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={onCloseTab}
          onCloseOtherTabs={onCloseOtherTabs}
          onCloseAllTabs={onCloseAllTabs}
          onTogglePinTab={onTogglePinTab}
          onReorderTab={handleReorderTab}
          onCreateTab={onCreateTab}
          onRenameTab={onRenameTab}
          getTabIcon={getTabIcon}
          enabledAgentKinds={enabledAgentKinds}
          disabled={disabled}
          focused={isActive}
          onSplitRight={onSplitRight ? () => onSplitRight(pane.id) : undefined}
          onSplitDown={onSplitDown ? () => onSplitDown(pane.id) : undefined}
          onTabDragStart={(tabId) => {
            setDraggingTabId(tabId);
            onTabDragStart?.(tabId);
          }}
          onTabDragEnd={() => {
            setDraggingTabId("");
            onTabDragEnd?.();
          }}
        />
      </Box>
      <SplitDropZone paneId={pane.id} active={isDraggingSplit} onDrop={handleSplitDrop}>
        <Box ref={setContentPlaceholder} sx={{ flex: 1, position: "relative", overflow: "hidden", height: "100%" }}>
          {renderContent(pane, contentPlaceholder)}
        </Box>
      </SplitDropZone>
    </Box>
  );
}
