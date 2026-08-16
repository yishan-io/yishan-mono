import { Box, Divider, Menu, MenuItem, Typography } from "@mui/material";
import { type ReactNode, useEffect, useState } from "react";
import { LuColumns2, LuRows2 } from "react-icons/lu";
import { fetchAgentSessionFilePath } from "../features/agent/commands/agentChatSessionHistory";
import { copyToClipboard } from "../helpers/clipboard";
import { getErrorMessage } from "../helpers/errorHelpers";
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
  onCreateTab: (option: TabBarCreateOption) => void;
};

export function CreateTabMenu({
  anchorEl,
  onClose,
  options,
  disabled,
  createMenuLabel,
  onCreateTab,
}: CreateTabMenuProps) {
  // Agent CLI presets (anything beyond the built-in tab kinds) form their own
  // group, separated from the rest of the menu by a divider.
  let agentGroupDividerRendered = false;

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 220 } } }}
    >
      {options.map((item) => {
        const isAgentCliOption =
          item.option !== "terminal" &&
          item.option !== "browser" &&
          item.option !== "agent-chat" &&
          item.option !== "whiteboard";
        const showGroupDivider = isAgentCliOption && !agentGroupDividerRendered;
        agentGroupDividerRendered = agentGroupDividerRendered || isAgentCliOption;

        return (
          <Box key={item.option}>
            {showGroupDivider ? <Divider sx={{ my: 0.5 }} /> : null}
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
              <Box
                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, width: "100%" }}
              >
                <Box component="span">{item.label}</Box>
                {item.shortcutLabel ? (
                  <Typography
                    variant="caption"
                    component="span"
                    aria-hidden="true"
                    sx={{
                      color: "text.secondary",
                      fontSize: 13,
                      lineHeight: 1,
                    }}
                  >
                    {item.shortcutLabel}
                  </Typography>
                ) : null}
              </Box>
            </MenuItem>
          </Box>
        );
      })}
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

export function SplitPaneMenu({
  anchorEl,
  onClose,
  disabled,
  selectedTabId,
  onSplitRight,
  onSplitDown,
}: SplitPaneMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 160 } } }}
    >
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
  copySessionIdActionLabel: string;
  copySessionFilePathActionLabel: string;
  tabsLength: number;
  onClose: () => void;
  onPromoteTemporaryTab?: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseAllTabs?: (tabId: string) => void;
  /** Agent-chat session id of the context tab; enables the copy-session-info items. */
  sessionId?: string;
  /** Working directory of the agent session; used to resolve the transcript file path. */
  cwd?: string;
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
  copySessionIdActionLabel,
  copySessionFilePathActionLabel,
  tabsLength,
  onClose,
  onPromoteTemporaryTab,
  onTogglePinTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  sessionId,
  cwd,
}: TabContextMenuProps) {
  const open = Boolean(contextMenu);
  // null while resolving; "" when no transcript exists yet; the path once known.
  const [sessionFilePath, setSessionFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sessionId || !cwd) {
      setSessionFilePath(null);
      return;
    }
    let cancelled = false;
    setSessionFilePath(null);
    fetchAgentSessionFilePath(sessionId, cwd)
      .then((filePath) => {
        if (!cancelled) {
          setSessionFilePath(filePath);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to resolve session file path", getErrorMessage(error));
          setSessionFilePath("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, cwd]);

  return (
    <Menu
      open={open}
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
      {sessionId && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              // fire-and-forget: clipboard write is best-effort; copyToClipboard swallows errors internally.
              void copyToClipboard(sessionId);
              onClose();
            }}
            disabled={!contextMenu}
          >
            {copySessionIdActionLabel}
          </MenuItem>
          <MenuItem
            onClick={() => {
              // fire-and-forget: clipboard write is best-effort; copyToClipboard swallows errors internally.
              if (sessionFilePath) {
                void copyToClipboard(sessionFilePath);
              }
              onClose();
            }}
            disabled={!contextMenu || !sessionFilePath}
          >
            {copySessionFilePathActionLabel}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
