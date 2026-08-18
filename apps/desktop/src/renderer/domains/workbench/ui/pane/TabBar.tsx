import { Box, IconButton } from "@mui/material";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuClock, LuColumns2, LuGlobe, LuMessageCircle, LuPencil, LuPlus, LuSquareTerminal } from "react-icons/lu";
import { getRendererPlatform } from "../../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../../shortcuts/shortcutDisplay";
import { TabBarItem } from "./TabBarItem";
import { CreateTabMenu, SplitPaneMenu, TabContextMenu } from "./TabBarMenus";
import { TabRenameDialog } from "./TabRenameDialog";
import { useTabDragDrop } from "./useTabDragDrop";

type WorkbenchTab = {
  id: string;
  title: string;
  pinned: boolean;
  kind?: string;
  isDirty?: boolean;
  isTemporary?: boolean;
  /** Present for agent-chat tabs: pi resume/runtime session id. */
  sessionId?: string;
  /** Present for agent-chat tabs: working directory of the pi process. */
  cwd?: string;
};

export type TabBarCreateOption = "browser" | "terminal" | "agent-chat" | "whiteboard" | string;

type AgentCreateOption = string;

/** Returns true when one create-menu option targets an agent terminal preset. */
function isAgentCreateOption(option: TabBarCreateOption): option is AgentCreateOption {
  return option !== "terminal" && option !== "browser" && option !== "agent-chat" && option !== "whiteboard";
}

/** One agent terminal preset entry in the tab create menu, supplied by the caller. */
export type AgentCreateOptionDef = {
  option: string;
  label: string;
  icon: ReactNode;
};

type TabBarProps = {
  tabs: WorkbenchTab[];
  selectedTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseAllTabs?: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onReorderTab?: (draggedTabId: string, targetTabId: string, position: "before" | "after") => void;
  onCreateTab: (option: TabBarCreateOption) => void;
  onPromoteTemporaryTab?: (tabId: string) => void;
  getTabIcon?: (tab: WorkbenchTab) => ReactNode;
  enabledAgentKinds?: AgentCreateOption[];
  /** Agent terminal presets shown in the tab create menu (supplied by the caller). */
  agentCreateOptions?: AgentCreateOptionDef[];
  disabled?: boolean;
  /** Called when a tab drag starts - useful for enabling split drop zones. */
  onTabDragStart?: (tabId: string) => void;
  /** Called when a tab drag ends. */
  onTabDragEnd?: () => void;
  /** Called when the user renames a tab (inline edit committed). */
  onRenameTab?: (tabId: string, title: string) => void;
  /** When false, the active tab left border shows grey instead of primary color. */
  focused?: boolean;
  /** Called when the user clicks "Split Right". Only shown when provided. */
  onSplitRight?: () => void;
  /** Called when the user clicks "Split Down". Only shown when provided. */
  onSplitDown?: () => void;
  /** Called when the user clicks the session history button. */
  onHistoryClick?: (event: React.MouseEvent<HTMLElement>) => void;
  /** Resolves one agent transcript file path for the tab context menu (supplied by the caller). */
  fetchAgentSessionFilePath?: (sessionId: string, cwd: string) => Promise<string>;
};

/**
 * Renders the workspace tab strip with pinned and unpinned tab groups.
 *
 * Pinned tabs are rendered in a fixed left group while only unpinned tabs
 * participate in horizontal scrolling.
 */
export function TabBar({
  tabs,
  selectedTabId,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onTogglePinTab,
  onReorderTab,
  onCreateTab,
  onPromoteTemporaryTab,
  getTabIcon,
  enabledAgentKinds,
  agentCreateOptions,
  disabled,
  onTabDragStart,
  onTabDragEnd,
  onRenameTab,
  focused = true,
  onSplitRight,
  onSplitDown,
  onHistoryClick,
  fetchAgentSessionFilePath,
}: TabBarProps) {
  const { t } = useTranslation();
  const untitledLabel = t("tabs.untitled");
  const newTabLabel = t("tabs.new");
  const createMenuLabel = t("tabs.createMenu.label");
  const terminalTitle = t("terminal.title");
  const browserCreateLabel = t("tabs.createMenu.browser");
  const browserTitle =
    browserCreateLabel !== "tabs.createMenu.browser"
      ? browserCreateLabel
      : t("browser.title") !== "browser.title"
        ? t("browser.title")
        : "Browser";
  const createLabelByAgentKind: Record<string, string> = (agentCreateOptions ?? []).reduce<Record<string, string>>(
    (next, item) => {
      next[item.option] = item.label;
      return next;
    },
    {},
  );
  const whiteboardCreateLabel = t("tabs.createMenu.whiteboard");
  const keepOpenActionLabel = t("tabs.actions.keepOpen");
  const pinTabActionLabel = t("tabs.actions.pin");
  const unpinTabActionLabel = t("tabs.actions.unpin");
  const closeTabActionLabel = t("tabs.actions.close");
  const closeOthersActionLabel = t("tabs.actions.closeOthers");
  const closeAllActionLabel = t("tabs.actions.closeAll");
  const copySessionIdActionLabel = t("tabs.actions.copySessionId");
  const copySessionFilePathActionLabel = t("tabs.actions.copySessionFilePath");

  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    tabId: string;
  } | null>(null);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<HTMLElement | null>(null);
  const [splitMenuAnchor, setSplitMenuAnchor] = useState<HTMLElement | null>(null);

  const scrollableTabsContainerRef = useRef<HTMLDivElement | null>(null);
  const tabItemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ─── Drag & drop state ─────────────────────────────────────────────────────

  const canDragTabs = Boolean(onReorderTab) && !disabled;
  const {
    draggedTabId,
    dropTarget,
    resetDragState,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDrop,
    handleTabsContainerDragOver,
    handleTabsContainerDrop,
  } = useTabDragDrop({ tabs, canDragTabs, onReorderTab, onTabDragStart, onTabDragEnd });

  // ─── Tab rename dialog ────────────────────────────────────────────────────

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDialogTab, setRenameDialogTab] = useState<WorkbenchTab | null>(null);

  const handleBeginRename = (tab: WorkbenchTab) => {
    // Only agent-chat tabs support rename for now.
    if (tab.kind !== "agent-chat") {
      return;
    }
    if (tab.id !== selectedTabId) {
      onSelectTab(tab.id);
    }
    setRenameDialogTab(tab);
    setRenameDialogOpen(true);
  };

  const handleRenameDialogClose = () => {
    setRenameDialogOpen(false);
    setRenameDialogTab(null);
  };

  const handleRenameDialogSave = (title: string) => {
    if (renameDialogTab && onRenameTab) {
      onRenameTab(renameDialogTab.id, title);
    }
    handleRenameDialogClose();
  };

  // ─── Auto-scroll newly created selected tab into view ─────────────────────

  const previousSelectedTabIdRef = useRef(selectedTabId);
  const previousTabIdsRef = useRef(new Set(tabs.map((tab) => tab.id)));

  useEffect(() => {
    const previousSelectedTabId = previousSelectedTabIdRef.current;
    const previousTabIds = previousTabIdsRef.current;
    const currentTabIds = new Set(tabs.map((tab) => tab.id));
    const selectedNewlyCreatedTab =
      selectedTabId && selectedTabId !== previousSelectedTabId && !previousTabIds.has(selectedTabId);

    previousSelectedTabIdRef.current = selectedTabId;
    previousTabIdsRef.current = currentTabIds;

    if (!selectedNewlyCreatedTab || !selectedTabId) {
      return;
    }

    const selectedTab = tabs.find((tab) => tab.id === selectedTabId);
    if (!selectedTab || selectedTab.pinned) {
      return;
    }

    const tabsContainer = scrollableTabsContainerRef.current;
    const selectedTabElement = tabItemRefs.current[selectedTabId];

    if (!tabsContainer || !selectedTabElement) {
      return;
    }

    const containerRect = tabsContainer.getBoundingClientRect();
    const tabRect = selectedTabElement.getBoundingClientRect();
    const isOutsideLeft = tabRect.left < containerRect.left;
    const isOutsideRight = tabRect.right > containerRect.right;

    if (isOutsideLeft || isOutsideRight) {
      selectedTabElement.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [selectedTabId, tabs]);

  // ─── Create menu options ───────────────────────────────────────────────────

  const platform = getRendererPlatform();
  const enabledAgentKindSet = new Set(enabledAgentKinds ?? (agentCreateOptions ?? []).map((item) => item.option));
  const allCreateOptions: Array<{
    option: TabBarCreateOption;
    label: string;
    icon: ReactNode;
    shortcutLabel: string | null;
  }> = [
    {
      option: "agent-chat",
      label: createMenuLabel !== "tabs.createMenu.label" ? t("agentChat.title") : "Agent Chat",
      icon: <LuMessageCircle size={14} />,
      shortcutLabel: getShortcutDisplayLabelById("open-agent-chat", platform),
    },
    {
      option: "whiteboard",
      label: whiteboardCreateLabel,
      icon: <LuPencil size={14} />,
      shortcutLabel: getShortcutDisplayLabelById("open-whiteboard", platform),
    },
    {
      option: "terminal",
      label: terminalTitle,
      icon: <LuSquareTerminal size={14} />,
      shortcutLabel: getShortcutDisplayLabelById("open-terminal", platform),
    },
    {
      option: "browser",
      label: browserTitle,
      icon: <LuGlobe size={14} />,
      shortcutLabel: getShortcutDisplayLabelById("open-browser", platform),
    },
    ...(agentCreateOptions ?? []).map(({ option, label, icon }) => ({
      option,
      label,
      icon,
      shortcutLabel: null,
    })),
  ];
  const createOptions = allCreateOptions.filter(
    (item) => !isAgentCreateOption(item.option) || enabledAgentKindSet.has(item.option),
  );

  // ─── Context menu ─────────────────────────────────────────────────────────

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>, tab: WorkbenchTab) => {
    event.preventDefault();
    event.stopPropagation();
    if (tab.id !== selectedTabId) {
      onSelectTab(tab.id);
    }
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      tabId: tab.id,
    });
  };

  const selectedContextTab = contextMenu ? (tabs.find((tab) => tab.id === contextMenu.tabId) ?? null) : null;

  // ─── Tab item renderer ────────────────────────────────────────────────────

  const renderTabItem = (tab: WorkbenchTab) => (
    <TabBarItem
      key={tab.id}
      tab={tab}
      active={tab.id === selectedTabId}
      canDrag={canDragTabs}
      draggedTabId={draggedTabId}
      dropTarget={dropTarget}
      focused={focused}
      untitledLabel={untitledLabel}
      unpinTabActionLabel={unpinTabActionLabel}
      closeTabActionLabel={closeTabActionLabel}
      getTabIcon={getTabIcon}
      onSelectTab={onSelectTab}
      onCloseTab={onCloseTab}
      onTogglePinTab={onTogglePinTab}
      onPromoteTemporaryTab={onPromoteTemporaryTab}
      onBeginRename={onRenameTab ? handleBeginRename : undefined}
      onContextMenu={handleContextMenu}
      onDragStart={handleTabDragStart}
      onDragOver={handleTabDragOver}
      onDrop={handleTabDrop}
      onDragEnd={resetDragState}
      itemRef={(element) => {
        tabItemRefs.current[tab.id] = element;
      }}
    />
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const unpinnedTabs = tabs.filter((tab) => !tab.pinned);

  return (
    <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, width: "100%", height: "100%" }}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          height: "100%",
        }}
      >
        {pinnedTabs.map(renderTabItem)}
        <Box
          ref={scrollableTabsContainerRef}
          onDragOver={handleTabsContainerDragOver}
          onDrop={handleTabsContainerDrop}
          sx={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            pr: 0.5,
            height: "100%",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            "&::-webkit-scrollbar": {
              display: "none",
            },
          }}
        >
          {unpinnedTabs.map(renderTabItem)}
        </Box>
        <IconButton
          aria-label={newTabLabel}
          onClick={(event) => setCreateMenuAnchor(event.currentTarget)}
          disabled={disabled}
          sx={{ flexShrink: 0, alignSelf: "center" }}
        >
          <LuPlus size={16} />
        </IconButton>
      </Box>
      {onHistoryClick && (
        <IconButton
          aria-label="Session history"
          onClick={onHistoryClick}
          disabled={disabled}
          sx={{ flexShrink: 0, alignSelf: "center", color: "text.secondary" }}
        >
          <LuClock size={16} />
        </IconButton>
      )}
      {(onSplitRight || onSplitDown) && (
        <IconButton
          aria-label="Split pane"
          onClick={(event) => setSplitMenuAnchor(event.currentTarget)}
          disabled={disabled || !selectedTabId}
          sx={{ flexShrink: 0, alignSelf: "center", color: "text.secondary" }}
        >
          <LuColumns2 size={16} />
        </IconButton>
      )}

      <CreateTabMenu
        anchorEl={createMenuAnchor}
        onClose={() => setCreateMenuAnchor(null)}
        options={createOptions}
        disabled={disabled}
        createMenuLabel={createMenuLabel}
        onCreateTab={onCreateTab}
      />

      <SplitPaneMenu
        anchorEl={splitMenuAnchor}
        onClose={() => setSplitMenuAnchor(null)}
        disabled={disabled}
        selectedTabId={selectedTabId}
        onSplitRight={onSplitRight}
        onSplitDown={onSplitDown}
      />

      <TabContextMenu
        contextMenu={contextMenu}
        selectedContextTab={selectedContextTab}
        keepOpenActionLabel={keepOpenActionLabel}
        pinTabActionLabel={pinTabActionLabel}
        unpinTabActionLabel={unpinTabActionLabel}
        closeTabActionLabel={closeTabActionLabel}
        closeOthersActionLabel={closeOthersActionLabel}
        closeAllActionLabel={closeAllActionLabel}
        copySessionIdActionLabel={copySessionIdActionLabel}
        copySessionFilePathActionLabel={copySessionFilePathActionLabel}
        tabsLength={tabs.length}
        onClose={closeContextMenu}
        onPromoteTemporaryTab={onPromoteTemporaryTab}
        onTogglePinTab={onTogglePinTab}
        onCloseTab={onCloseTab}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseAllTabs={onCloseAllTabs}
        sessionId={selectedContextTab?.sessionId}
        cwd={selectedContextTab?.cwd}
        fetchAgentSessionFilePath={fetchAgentSessionFilePath}
      />

      <TabRenameDialog
        open={renameDialogOpen}
        currentTitle={renameDialogTab?.title ?? ""}
        untitledLabel={untitledLabel}
        onSave={handleRenameDialogSave}
        onClose={handleRenameDialogClose}
      />
    </Box>
  );
}
