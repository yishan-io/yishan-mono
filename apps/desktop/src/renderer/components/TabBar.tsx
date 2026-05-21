import { Box, ButtonBase, Divider, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuColumns2, LuGlobe, LuPin, LuPlus, LuRows2, LuSquareTerminal, LuX } from "react-icons/lu";
import {
  AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "../helpers/agentSettings";
import { getRendererPlatform } from "../helpers/platform";
import { getShortcutDisplayLabelById } from "../shortcuts/shortcutDisplay";
import { AgentIcon } from "./AgentIcon";
import { useTabDragDrop } from "./useTabDragDrop";

type WorkspaceTab = {
  id: string;
  title: string;
  pinned: boolean;
  kind?: string;
  isDirty?: boolean;
  isTemporary?: boolean;
};

export type TabBarCreateOption = "browser" | "terminal" | DesktopAgentKind;

type AgentCreateOption = DesktopAgentKind;

/** Returns true when one create-menu option targets an agent terminal preset. */
function isAgentCreateOption(option: TabBarCreateOption): option is AgentCreateOption {
  return option !== "terminal" && option !== "browser";
}

const dirtyDotSx = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  bgcolor: "primary.main",
  flexShrink: 0,
} as const;

/** Renders one small colored dot indicating unsaved changes on a tab. */
function TabDirtyDot({ tabId, isDirty }: { tabId: string; isDirty?: boolean }) {
  if (!isDirty) {
    return null;
  }
  return <Box component="span" data-testid={`tab-dirty-dot-${tabId}`} aria-hidden sx={dirtyDotSx} />;
}

type TabBarProps = {
  tabs: WorkspaceTab[];
  selectedTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseAllTabs?: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onReorderTab?: (draggedTabId: string, targetTabId: string, position: "before" | "after") => void;
  onCreateTab: (option: TabBarCreateOption) => void;
  onPromoteTemporaryTab?: (tabId: string) => void;
  getTabIcon?: (tab: WorkspaceTab) => ReactNode;
  enabledAgentKinds?: AgentCreateOption[];
  disabled?: boolean;
  /** Called when a tab drag starts - useful for enabling split drop zones. */
  onTabDragStart?: (tabId: string) => void;
  /** Called when a tab drag ends. */
  onTabDragEnd?: () => void;
  /** When false, the active tab left border shows grey instead of primary color. */
  focused?: boolean;
  /** Called when the user clicks "Split Right". Only shown when provided. */
  onSplitRight?: () => void;
  /** Called when the user clicks "Split Down". Only shown when provided. */
  onSplitDown?: () => void;
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
  disabled,
  onTabDragStart,
  onTabDragEnd,
  focused = true,
  onSplitRight,
  onSplitDown,
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
  const createLabelByAgentKind = SUPPORTED_DESKTOP_AGENT_KINDS.reduce<Record<DesktopAgentKind, string>>(
    (next, agentKind) => {
      next[agentKind] = t(AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND[agentKind]);
      return next;
    },
    {} as Record<DesktopAgentKind, string>,
  );
  const keepOpenActionLabel = t("tabs.actions.keepOpen");
  const pinTabActionLabel = t("tabs.actions.pin");
  const unpinTabActionLabel = t("tabs.actions.unpin");
  const closeTabActionLabel = t("tabs.actions.close");
  const closeOthersActionLabel = t("tabs.actions.closeOthers");
  const closeAllActionLabel = t("tabs.actions.closeAll");

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
  const enabledAgentKindSet = new Set(enabledAgentKinds ?? SUPPORTED_DESKTOP_AGENT_KINDS);
  const allCreateOptions: Array<{
    option: TabBarCreateOption;
    label: string;
    icon: ReactNode;
    shortcutLabel: string | null;
  }> = [
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
    ...SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => {
      const label = createLabelByAgentKind[agentKind];
      return {
        option: agentKind,
        label,
        icon: <AgentIcon agentKind={agentKind} context="tabMenu" label={label} />,
        shortcutLabel: null,
      };
    }),
  ];
  const createOptions = allCreateOptions.filter(
    (item) => !isAgentCreateOption(item.option) || enabledAgentKindSet.has(item.option),
  );
  const hasAgentCreateOptions = createOptions.some((item) => isAgentCreateOption(item.option));

  // ─── Tab item styles ──────────────────────────────────────────────────────

  const buildTabContainerSx = (active: boolean) => ({
    display: "flex",
    alignItems: "center",
    bgcolor: active ? "background.default" : "transparent",
    px: 2,
    width: 180,
    flexShrink: 0,
    position: "relative",
    zIndex: active ? 1 : 0,
    mb: active ? "-1px" : 0,
    transition: "background-color 120ms ease",
    borderRight: "1px solid",
    borderRightColor: "divider",
    ...(active
      ? {
          borderLeft: "1px solid",
          borderLeftColor: focused ? "primary.main" : "divider",
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -1,
            height: 2,
            bgcolor: "background.default",
          },
        }
      : {}),
    "& .tab-close": {
      opacity: 0,
      pointerEvents: "none",
      transition: "opacity 0.15s ease",
    },
    "&:hover": {
      bgcolor: active ? "background.default" : "action.hover",
    },
    "&:hover .tab-close": {
      opacity: 1,
      pointerEvents: "auto",
    },
    "& .tab-content": {
      flexGrow: 1,
      minWidth: 0,
    },
    cursor: canDragTabs ? "grab" : "default",
  });

  // ─── Context menu ─────────────────────────────────────────────────────────

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>, tab: WorkspaceTab) => {
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

  const selectedContextTab = contextMenu ? tabs.find((tab) => tab.id === contextMenu.tabId) : null;

  // ─── Tab item renderer ────────────────────────────────────────────────────

  const renderTabItem = (tab: WorkspaceTab) => {
    const active = tab.id === selectedTabId;
    const pinned = tab.pinned;

    return (
      <Box
        key={tab.id}
        ref={(element: HTMLDivElement | null) => {
          tabItemRefs.current[tab.id] = element;
        }}
        draggable={canDragTabs}
        onContextMenu={(event) => handleContextMenu(event, tab)}
        onDragStart={(event) => handleTabDragStart(event, tab, "")}
        onDragOver={(event) => handleTabDragOver(event, tab)}
        onDrop={(event) => handleTabDrop(event, tab)}
        onDragEnd={resetDragState}
        sx={{
          ...buildTabContainerSx(active),
          ...(dropTarget?.tabId === tab.id && {
            ...(dropTarget.position === "before"
              ? {
                  boxShadow: (theme) => `inset 2px 0 0 ${theme.palette.primary.main}`,
                }
              : {
                  boxShadow: (theme) => `inset -2px 0 0 ${theme.palette.primary.main}`,
                }),
          }),
          opacity: draggedTabId === tab.id ? 0.9 : 1,
        }}
      >
        <ButtonBase
            className="tab-content"
            disableRipple
            onClick={() => onSelectTab(tab.id)}
            onDoubleClick={() => {
              if (tab.isTemporary) {
                onPromoteTemporaryTab?.(tab.id);
              }
            }}
            sx={{
              typography: "body2",
              color: active ? "text.primary" : "text.secondary",
              py: 1,
              pl: 0.5,
              pr: 0.25,
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            {getTabIcon?.(tab)}
            <TabDirtyDot tabId={tab.id} isDirty={tab.isDirty} />
            <Box
              component="span"
              style={{ fontStyle: tab.isTemporary ? "italic" : "normal" }}
              sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {tab.title || untitledLabel}
            </Box>
          </ButtonBase>
        {pinned ? (
          <IconButton
            className="tab-pin"
            size="small"
            aria-label={unpinTabActionLabel}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePinTab?.(tab.id);
            }}
            disabled={!onTogglePinTab}
            sx={{
              color: active ? "text.primary" : "text.secondary",
              p: 0.5,
              mr: -2,
              display: "inline-flex",
            }}
          >
            <LuPin size={14} />
          </IconButton>
        ) : (
          <IconButton
            className="tab-close"
            size="small"
            aria-label={closeTabActionLabel}
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab(tab.id);
            }}
            disabled={false}
            sx={{
              color: active ? "text.primary" : "text.secondary",
              p: 0.5,
              mr: -2,
              display: "inline-flex",
            }}
          >
            <LuX size={14} />
          </IconButton>
        )}
      </Box>
    );
  };

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
          size="small"
          aria-label={newTabLabel}
          onClick={(event) => setCreateMenuAnchor(event.currentTarget)}
          disabled={disabled}
          sx={{ flexShrink: 0, alignSelf: "center" }}
        >
          <LuPlus size={16} />
        </IconButton>
      </Box>
      {(onSplitRight || onSplitDown) && (
        <IconButton
          size="small"
          aria-label="Split pane"
          onClick={(event) => setSplitMenuAnchor(event.currentTarget)}
          disabled={disabled || !selectedTabId}
          sx={{ flexShrink: 0, alignSelf: "center", color: "text.secondary" }}
        >
          <LuColumns2 size={16} />
        </IconButton>
      )}

      {/* Create tab menu */}
      <Menu
        anchorEl={createMenuAnchor}
        open={Boolean(createMenuAnchor)}
        onClose={() => setCreateMenuAnchor(null)}
        slotProps={{
          paper: {
            sx: {
              minWidth: 220,
            },
          },
        }}
      >
        {createOptions.map((item) => (
          <Box key={item.option}>
            <MenuItem
              onClick={() => {
                onCreateTab(item.option);
                setCreateMenuAnchor(null);
              }}
              disabled={disabled}
              sx={{ gap: 1 }}
              aria-label={`${createMenuLabel}: ${item.label}`}
            >
              {item.icon}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  width: "100%",
                }}
              >
                <Box component="span">{item.label}</Box>
                {item.shortcutLabel ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="span"
                    aria-hidden="true"
                    sx={{ fontSize: 13, lineHeight: 1 }}
                  >
                    {item.shortcutLabel}
                  </Typography>
                ) : null}
              </Box>
            </MenuItem>
            {item.option === "browser" && hasAgentCreateOptions ? <Divider sx={{ my: 0.5 }} /> : null}
          </Box>
        ))}
      </Menu>

      {/* Split pane menu */}
      <Menu
        anchorEl={splitMenuAnchor}
        open={Boolean(splitMenuAnchor)}
        onClose={() => setSplitMenuAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {onSplitRight && (
          <MenuItem
            onClick={() => {
              onSplitRight();
              setSplitMenuAnchor(null);
            }}
            disabled={disabled || !selectedTabId}
            sx={{ gap: 1 }}
          >
            <LuColumns2 size={14} />
            <Box component="span">Split Right</Box>
          </MenuItem>
        )}
        {onSplitDown && (
          <MenuItem
            onClick={() => {
              onSplitDown();
              setSplitMenuAnchor(null);
            }}
            disabled={disabled || !selectedTabId}
            sx={{ gap: 1 }}
          >
            <LuRows2 size={14} />
            <Box component="span">Split Down</Box>
          </MenuItem>
        )}
      </Menu>

      {/* Tab context menu */}
      <Menu
        open={Boolean(contextMenu)}
        onClose={closeContextMenu}
        disableRestoreFocus
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        {selectedContextTab?.isTemporary && (
          <MenuItem
            onClick={() => {
              if (contextMenu?.tabId) {
                onPromoteTemporaryTab?.(contextMenu.tabId);
              }
              closeContextMenu();
            }}
          >
            {keepOpenActionLabel}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (contextMenu?.tabId) {
              onTogglePinTab?.(contextMenu.tabId);
            }
            closeContextMenu();
          }}
          disabled={!contextMenu || !onTogglePinTab}
        >
          {selectedContextTab?.pinned ? unpinTabActionLabel : pinTabActionLabel}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu?.tabId) {
              onCloseTab(contextMenu.tabId);
            }
            closeContextMenu();
          }}
          disabled={!contextMenu || Boolean(selectedContextTab?.pinned)}
        >
          {closeTabActionLabel}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu?.tabId) {
              onCloseOtherTabs?.(contextMenu.tabId);
            }
            closeContextMenu();
          }}
          disabled={!contextMenu || !onCloseOtherTabs || tabs.length <= 1}
        >
          {closeOthersActionLabel}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu?.tabId) {
              onCloseAllTabs?.(contextMenu.tabId);
            }
            closeContextMenu();
          }}
          disabled={!contextMenu || !onCloseAllTabs || tabs.length === 0}
        >
          {closeAllActionLabel}
        </MenuItem>
      </Menu>
    </Box>
  );
}
