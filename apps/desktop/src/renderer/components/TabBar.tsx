import { Box, ButtonBase, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPin, LuPlus, LuSquareTerminal, LuX } from "react-icons/lu";
import {
  AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "../helpers/agentSettings";
import { getRendererPlatform } from "../helpers/platform";
import { getShortcutDisplayLabelById } from "../shortcuts/shortcutDisplay";
import { AgentIcon } from "./AgentIcon";

type WorkspaceTab = {
  id: string;
  title: string;
  pinned: boolean;
  kind?: string;
  isDirty?: boolean;
  isTemporary?: boolean;
};

export type TabBarCreateOption = "terminal" | DesktopAgentKind;

type AgentCreateOption = DesktopAgentKind;

/** Returns true when one create-menu option targets an agent terminal preset. */
function isAgentCreateOption(option: TabBarCreateOption): option is AgentCreateOption {
  return option !== "terminal";
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
  onRenameTab: (tabId: string, title: string) => void;
  getTabIcon?: (tab: WorkspaceTab) => ReactNode;
  enabledAgentKinds?: AgentCreateOption[];
  disabled?: boolean;
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
  onRenameTab,
  getTabIcon,
  enabledAgentKinds,
  disabled,
}: TabBarProps) {
  const { t } = useTranslation();
  const untitledLabel = t("tabs.untitled");
  const newTabLabel = t("tabs.new");
  const createMenuLabel = t("tabs.createMenu.label");
  const terminalTitle = t("terminal.title");
  const createLabelByAgentKind = SUPPORTED_DESKTOP_AGENT_KINDS.reduce<Record<DesktopAgentKind, string>>(
    (next, agentKind) => {
      next[agentKind] = t(AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND[agentKind]);
      return next;
    },
    {} as Record<DesktopAgentKind, string>,
  );
  const renameTabLabel = t("tabs.renameA11y");
  const renameActionLabel = t("tabs.actions.rename");
  const pinTabActionLabel = t("tabs.actions.pin");
  const unpinTabActionLabel = t("tabs.actions.unpin");
  const closeTabActionLabel = t("tabs.actions.close");
  const closeOthersActionLabel = t("tabs.actions.closeOthers");
  const closeAllActionLabel = t("tabs.actions.closeAll");
  const [editingTabId, setEditingTabId] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    tabId: string;
  } | null>(null);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<HTMLElement | null>(null);
  const [draggedTabId, setDraggedTabId] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    tabId: string;
    position: "before" | "after";
  } | null>(null);
  const scrollableTabsContainerRef = useRef<HTMLDivElement | null>(null);
  const tabItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const editingRef = useRef<HTMLDivElement | null>(null);
  const editingDraftRef = useRef("");

  useEffect(() => {
    if (!editingTabId || !editingRef.current) {
      return;
    }

    const editable = editingRef.current;
    editable.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    editable.textContent = editingDraftRef.current;
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editingTabId]);

  useEffect(() => {
    if (!selectedTabId) {
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

  const beginRename = (tab: WorkspaceTab) => {
    setEditingTabId(tab.id);
    editingDraftRef.current = tab.title || untitledLabel;
    onSelectTab(tab.id);
  };

  const commitRename = (tab: WorkspaceTab) => {
    const nextTitle = editingDraftRef.current.trim();
    if (nextTitle && nextTitle !== tab.title) {
      onRenameTab(tab.id, nextTitle);
    }
    setEditingTabId("");
    editingDraftRef.current = "";
  };

  const cancelRename = () => {
    setEditingTabId("");
    editingDraftRef.current = "";
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const resetDragState = () => {
    setDraggedTabId("");
    setDropTarget(null);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectTab(tab.id);
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      tabId: tab.id,
    });
  };

  const selectedContextTab = contextMenu ? tabs.find((tab) => tab.id === contextMenu.tabId) : null;

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

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const selection = window.getSelection();
      if (!selection) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(event.currentTarget);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(tab);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  const canDragTabs = Boolean(onReorderTab) && !disabled;
  const buildTabContainerSx = (active: boolean, editing: boolean) => ({
    display: "flex",
    alignItems: "center",
    bgcolor: active ? "background.default" : "transparent",
    px: 2,
    flexShrink: 0,
    position: "relative",
    zIndex: active ? 1 : 0,
    mb: active ? "-1px" : 0,
    transition: "background-color 120ms ease",
    borderRight: "1px solid",
    borderColor: "divider",
    ...(active
      ? {
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
    cursor: canDragTabs && !editing ? "grab" : "default",
  });

  /**
   * Resolves the target used when dropping near the right edge of the scroll area.
   *
   * The target stays inside the dragged tab's pin-group so pinned and unpinned tabs
   * preserve their group boundaries during drag reordering.
   */
  const resolveTrailingDropTarget = (draggedId: string) => {
    const draggedTab = tabs.find((tab) => tab.id === draggedId);
    if (!draggedTab) {
      return null;
    }

    const lastTabInGroup =
      tabs.filter((tab) => tab.pinned === draggedTab.pinned && tab.id !== draggedId).at(-1) ?? null;

    if (!lastTabInGroup) {
      return null;
    }

    return {
      tabId: lastTabInGroup.id,
      position: "after" as const,
    };
  };

  const handleTabDragStart = (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if (!canDragTabs || editingTabId) {
      event.preventDefault();
      return;
    }

    setDraggedTabId(tab.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab.id);
  };

  const handleTabDragOver = (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if (!canDragTabs) {
      return;
    }

    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === tab.id) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const position = event.clientX < midpoint ? "before" : "after";
    setDropTarget({ tabId: tab.id, position });
    event.dataTransfer.dropEffect = "move";
  };

  const handleTabDrop = (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => {
    if (!canDragTabs) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    const position = dropTarget?.tabId === tab.id ? dropTarget.position : "before";

    if (draggedId && draggedId !== tab.id) {
      onReorderTab?.(draggedId, tab.id, position);
    }

    resetDragState();
  };

  const handleTabsContainerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canDragTabs) {
      return;
    }

    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    if (!draggedId) {
      return;
    }

    const draggedTab = tabs.find((tab) => tab.id === draggedId);
    if (!draggedTab || draggedTab.pinned) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const rightEdgeThreshold = 24;

    if (event.clientX >= rect.right - rightEdgeThreshold) {
      const trailingTarget = resolveTrailingDropTarget(draggedId);
      if (trailingTarget) {
        event.preventDefault();
        setDropTarget(trailingTarget);
        event.dataTransfer.dropEffect = "move";
      }
    }
  };

  const handleTabsContainerDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canDragTabs) {
      return;
    }

    const draggedId = draggedTabId || event.dataTransfer.getData("text/plain");
    if (!draggedId) {
      resetDragState();
      return;
    }

    const draggedTab = tabs.find((tab) => tab.id === draggedId);
    if (!draggedTab || draggedTab.pinned) {
      resetDragState();
      return;
    }

    const trailingTarget = resolveTrailingDropTarget(draggedId);
    const target = dropTarget ?? trailingTarget;

    if (target) {
      event.preventDefault();
      onReorderTab?.(draggedId, target.tabId, target.position);
    }

    resetDragState();
  };

  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const unpinnedTabs = tabs.filter((tab) => !tab.pinned);

  return (
    <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, height: "100%" }}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          height: "100%",
        }}
      >
        {pinnedTabs.map((tab) => {
          const active = tab.id === selectedTabId;
          const editing = tab.id === editingTabId;
          const pinned = tab.pinned;

          return (
            <Box
              key={tab.id}
              ref={(element: HTMLDivElement | null) => {
                tabItemRefs.current[tab.id] = element;
              }}
              draggable={canDragTabs && !editing}
              onContextMenu={(event) => handleContextMenu(event, tab)}
              onDragStart={(event) => handleTabDragStart(event, tab)}
              onDragOver={(event) => handleTabDragOver(event, tab)}
              onDrop={(event) => handleTabDrop(event, tab)}
              onDragEnd={resetDragState}
              sx={{
                ...buildTabContainerSx(active, editing),
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
              {editing ? (
                <Box
                  className="tab-content"
                  sx={{
                    py: 0.75,
                    pl: 0.5,
                    pr: 0.25,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  {getTabIcon?.(tab)}
                  {tab.isDirty ? (
                    <Box
                      component="span"
                      data-testid={`tab-dirty-dot-${tab.id}`}
                      aria-hidden
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  <Box
                    ref={editingRef}
                    component="div"
                    contentEditable
                    suppressContentEditableWarning
                    aria-label={renameTabLabel}
                    onKeyDown={(event) => handleRenameKeyDown(event, tab)}
                    onInput={(event) => {
                      editingDraftRef.current = event.currentTarget.textContent ?? "";
                    }}
                    onBlur={cancelRename}
                    sx={{
                      typography: "body2",
                      color: active ? "text.primary" : "text.secondary",
                      minWidth: 24,
                      maxWidth: 220,
                      outline: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {tab.title || untitledLabel}
                  </Box>
                </Box>
              ) : (
                <ButtonBase
                  className="tab-content"
                  disableRipple
                  onClick={() => onSelectTab(tab.id)}
                  onDoubleClick={() => beginRename(tab)}
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
                  {tab.isDirty ? (
                    <Box
                      component="span"
                      data-testid={`tab-dirty-dot-${tab.id}`}
                      aria-hidden
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  <Box component="span" style={{ fontStyle: tab.isTemporary ? "italic" : "normal" }}>
                    {tab.title || untitledLabel}
                  </Box>
                </ButtonBase>
              )}
              {pinned ? (
                <IconButton
                  className="tab-pin"
                  size="small"
                  aria-label={unpinTabActionLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePinTab?.(tab.id);
                  }}
                  disabled={editing || !onTogglePinTab}
                  sx={{
                    color: active ? "text.primary" : "text.secondary",
                    p: 0.5,
                    mr: -2,
                    display: editing ? "none" : "inline-flex",
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
                  disabled={editing}
                  sx={{
                    color: active ? "text.primary" : "text.secondary",
                    p: 0.5,
                    mr: -2,
                    display: editing ? "none" : "inline-flex",
                  }}
                >
                  <LuX size={14} />
                </IconButton>
              )}
            </Box>
          );
        })}
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
          {unpinnedTabs.map((tab) => {
            const active = tab.id === selectedTabId;
            const editing = tab.id === editingTabId;
            const pinned = tab.pinned;

            return (
              <Box
                key={tab.id}
                ref={(element: HTMLDivElement | null) => {
                  tabItemRefs.current[tab.id] = element;
                }}
                draggable={canDragTabs && !editing}
                onContextMenu={(event) => handleContextMenu(event, tab)}
                onDragStart={(event) => handleTabDragStart(event, tab)}
                onDragOver={(event) => handleTabDragOver(event, tab)}
                onDrop={(event) => handleTabDrop(event, tab)}
                onDragEnd={resetDragState}
                sx={{
                  ...buildTabContainerSx(active, editing),
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
                {editing ? (
                  <Box
                    className="tab-content"
                    sx={{
                      py: 0.75,
                      pl: 0.5,
                      pr: 0.25,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    {getTabIcon?.(tab)}
                    {tab.isDirty ? (
                      <Box
                        component="span"
                        data-testid={`tab-dirty-dot-${tab.id}`}
                        aria-hidden
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          flexShrink: 0,
                        }}
                      />
                    ) : null}
                    <Box
                      ref={editingRef}
                      component="div"
                      contentEditable
                      suppressContentEditableWarning
                      aria-label={renameTabLabel}
                      onKeyDown={(event) => handleRenameKeyDown(event, tab)}
                      onInput={(event) => {
                        editingDraftRef.current = event.currentTarget.textContent ?? "";
                      }}
                      onBlur={cancelRename}
                      sx={{
                        typography: "body2",
                        color: active ? "text.primary" : "text.secondary",
                        minWidth: 24,
                        maxWidth: 220,
                        outline: "none",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {tab.title || untitledLabel}
                    </Box>
                  </Box>
                ) : (
                  <ButtonBase
                    className="tab-content"
                    disableRipple
                    onClick={() => onSelectTab(tab.id)}
                    onDoubleClick={() => beginRename(tab)}
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
                    {tab.isDirty ? (
                      <Box
                        component="span"
                        data-testid={`tab-dirty-dot-${tab.id}`}
                        aria-hidden
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          flexShrink: 0,
                        }}
                      />
                    ) : null}
                    <Box component="span" style={{ fontStyle: tab.isTemporary ? "italic" : "normal" }}>
                      {tab.title || untitledLabel}
                    </Box>
                  </ButtonBase>
                )}
                {pinned ? (
                  <IconButton
                    className="tab-pin"
                    size="small"
                    aria-label={unpinTabActionLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePinTab?.(tab.id);
                    }}
                    disabled={editing || !onTogglePinTab}
                    sx={{
                      color: active ? "text.primary" : "text.secondary",
                      p: 0.5,
                      mr: -2,
                      display: editing ? "none" : "inline-flex",
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
                    disabled={editing}
                    sx={{
                      color: active ? "text.primary" : "text.secondary",
                      p: 0.5,
                      mr: -2,
                      display: editing ? "none" : "inline-flex",
                    }}
                  >
                    <LuX size={14} />
                  </IconButton>
                )}
              </Box>
            );
          })}
        </Box>
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
          <MenuItem
            key={item.option}
            onClick={() => {
              onCreateTab(item.option);
              setCreateMenuAnchor(null);
            }}
            disabled={disabled}
            sx={{ gap: 1 }}
            aria-label={`${createMenuLabel}: ${item.label}`}
          >
            {item.icon}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, width: "100%" }}>
              <Box component="span">{item.label}</Box>
              {item.shortcutLabel ? (
                <Typography variant="caption" color="text.secondary" component="span" aria-hidden="true">
                  {item.shortcutLabel}
                </Typography>
              ) : null}
            </Box>
          </MenuItem>
        ))}
      </Menu>
      <Menu
        open={Boolean(contextMenu)}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem
          onClick={() => {
            const tab = tabs.find((item) => item.id === contextMenu?.tabId);
            if (tab) {
              beginRename(tab);
            }
            closeContextMenu();
          }}
          disabled={!contextMenu}
        >
          {renameActionLabel}
        </MenuItem>
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
