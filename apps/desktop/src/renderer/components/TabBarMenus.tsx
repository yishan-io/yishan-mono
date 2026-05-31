import { Box, Divider, Menu, MenuItem, Typography } from "@mui/material";
import { LuColumns2, LuRows2 } from "react-icons/lu";
import type { ReactNode } from "react";
import type { TabBarCreateOption } from "./TabBar";

type CreateMenuOption = {
  option: TabBarCreateOption;
  label: string;
  icon: ReactNode;
  shortcutLabel: string | null;
};

type TabContextMenuState = {
  mouseX: number;
  mouseY: number;
  tabId: string;
} | null;

type WorkspaceTab = {
  id: string;
  title: string;
  pinned: boolean;
  kind?: string;
  isDirty?: boolean;
  isTemporary?: boolean;
};

type CreateTabMenuProps = {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  options: CreateMenuOption[];
  disabled?: boolean;
  createMenuLabel: string;
  hasAgentCreateOptions: boolean;
  onCreateTab: (option: TabBarCreateOption) => void;
};

export function CreateTabMenu({
  anchorEl,
  onClose,
  options,
  disabled,
  createMenuLabel,
  hasAgentCreateOptions,
  onCreateTab,
}: CreateTabMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 220 } } }}
    >
      {options.map((item) => (
        <Box key={item.option}>
          <MenuItem
            onClick={() => {
              onCreateTab(item.option);
              onClose();
            }}
            disabled={disabled}
            sx={{ gap: 1 }}
            aria-label={`${createMenuLabel}: ${item.label}`}
          >
            {item.icon}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, width: "100%" }}>
              <Box component="span">{item.label}</Box>
              {item.shortcutLabel ? (
                <Typography variant="caption" color="text.secondary" component="span" aria-hidden="true" sx={{ fontSize: 13, lineHeight: 1 }}>
                  {item.shortcutLabel}
                </Typography>
              ) : null}
            </Box>
          </MenuItem>
          {item.option === "browser" && hasAgentCreateOptions ? <Divider sx={{ my: 0.5 }} /> : null}
        </Box>
      ))}
    </Menu>
  );
}

type SplitPaneMenuProps = {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  disabled?: boolean;
  selectedTabId: string;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
};

export function SplitPaneMenu({ anchorEl, onClose, disabled, selectedTabId, onSplitRight, onSplitDown }: SplitPaneMenuProps) {
  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose} slotProps={{ paper: { sx: { minWidth: 160 } } }}>
      {onSplitRight && (
        <MenuItem
          onClick={() => {
            onSplitRight();
            onClose();
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
            onClose();
          }}
          disabled={disabled || !selectedTabId}
          sx={{ gap: 1 }}
        >
          <LuRows2 size={14} />
          <Box component="span">Split Down</Box>
        </MenuItem>
      )}
    </Menu>
  );
}

type TabContextMenuProps = {
  contextMenu: TabContextMenuState;
  selectedContextTab: WorkspaceTab | null;
  keepOpenActionLabel: string;
  pinTabActionLabel: string;
  unpinTabActionLabel: string;
  closeTabActionLabel: string;
  closeOthersActionLabel: string;
  closeAllActionLabel: string;
  tabsLength: number;
  onClose: () => void;
  onPromoteTemporaryTab?: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseAllTabs?: (tabId: string) => void;
};

export function TabContextMenu({
  contextMenu,
  selectedContextTab,
  keepOpenActionLabel,
  pinTabActionLabel,
  unpinTabActionLabel,
  closeTabActionLabel,
  closeOthersActionLabel,
  closeAllActionLabel,
  tabsLength,
  onClose,
  onPromoteTemporaryTab,
  onTogglePinTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
}: TabContextMenuProps) {
  return (
    <Menu
      open={Boolean(contextMenu)}
      onClose={onClose}
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
            onClose();
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
          onClose();
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
          onClose();
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
          onClose();
        }}
        disabled={!contextMenu || !onCloseOtherTabs || tabsLength <= 1}
      >
        {closeOthersActionLabel}
      </MenuItem>
      <MenuItem
        onClick={() => {
          if (contextMenu?.tabId) {
            onCloseAllTabs?.(contextMenu.tabId);
          }
          onClose();
        }}
        disabled={!contextMenu || !onCloseAllTabs || tabsLength === 0}
      >
        {closeAllActionLabel}
      </MenuItem>
    </Menu>
  );
}
