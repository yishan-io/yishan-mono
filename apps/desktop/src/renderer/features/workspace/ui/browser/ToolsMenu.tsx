import { Divider, Menu, MenuItem } from "@mui/material";
import { LuCamera, LuCookie, LuDatabaseZap, LuHistory, LuRefreshCcw, LuTrash2, LuWrench } from "react-icons/lu";

type ToolsMenuProps = {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onOpenDevTools: () => void;
  onForceReload: () => void;
  onTakeSnapshot: () => void;
  onClearCache: () => void;
  onClearCookies: () => void;
  onClearHistory: () => void;
  onClearAllData: () => void;
};

export function ToolsMenu({
  anchorEl,
  onClose,
  onOpenDevTools,
  onForceReload,
  onTakeSnapshot,
  onClearCache,
  onClearCookies,
  onClearHistory,
  onClearAllData,
}: ToolsMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <MenuItem onClick={onOpenDevTools}>
        <LuWrench size={14} style={{ marginRight: 8 }} />
        Open Devtool
      </MenuItem>
      <MenuItem onClick={onForceReload}>
        <LuRefreshCcw size={14} style={{ marginRight: 8 }} />
        Force Reload
      </MenuItem>
      <MenuItem onClick={() => void onTakeSnapshot()}>
        <LuCamera size={14} style={{ marginRight: 8 }} />
        Take Snapshot
      </MenuItem>
      <Divider />
      <MenuItem onClick={() => void onClearCache()}>
        <LuTrash2 size={14} style={{ marginRight: 8 }} />
        Clear Cache
      </MenuItem>
      <MenuItem onClick={() => void onClearCookies()}>
        <LuCookie size={14} style={{ marginRight: 8 }} />
        Clear Cookies
      </MenuItem>
      <MenuItem onClick={onClearHistory}>
        <LuHistory size={14} style={{ marginRight: 8 }} />
        Clear History
      </MenuItem>
      <MenuItem onClick={() => void onClearAllData()}>
        <LuDatabaseZap size={14} style={{ marginRight: 8 }} />
        Clear All Data
      </MenuItem>
    </Menu>
  );
}
