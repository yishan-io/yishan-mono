import { Box, IconButton, InputAdornment, ListItemIcon, ListItemText, MenuList, MenuItem, Paper, Popper, TextField, Tooltip } from "@mui/material";
import type { FormEvent } from "react";
import { LuArrowLeft, LuArrowRight, LuGlobe, LuLock, LuLockOpen, LuRefreshCcw } from "react-icons/lu";
import { RxExternalLink } from "react-icons/rx";
import { openExternalUrl } from "../../../commands/appCommands";
import type { BrowserHistoryGroup } from "../../../../main/ipc";

type UrlBarProps = {
  displayUrl: string;
  urlFocused: boolean;
  isHttps: boolean;
  isHttp: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  resolvedUrl: string;
  historyGroups: BrowserHistoryGroup[];
  filteredHistory: Array<{ url: string; title: string; faviconUrl?: string; visitedAt: string }>;
  highlightIndex: number;
  textFieldRef: React.RefObject<HTMLDivElement | null>;
  onUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onNavigateTo: (url: string) => void;
  onSetHighlightIndex: (index: number) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onToolsClick: (event: React.MouseEvent<HTMLElement>) => void;
  children: React.ReactNode;
};

export function UrlBar({
  displayUrl,
  urlFocused,
  isHttps,
  isHttp,
  canGoBack,
  canGoForward,
  resolvedUrl,
  historyGroups,
  filteredHistory,
  highlightIndex,
  textFieldRef,
  onUrlChange,
  onSubmit,
  onFocus,
  onBlur,
  onKeyDown,
  onNavigateTo,
  onSetHighlightIndex,
  onGoBack,
  onGoForward,
  onReload,
  onToolsClick,
  children,
}: UrlBarProps) {
  return (
    <Box component="form" onSubmit={onSubmit} sx={{ display: "flex", gap: 1 }}>
      <IconButton aria-label="Go back" disabled={!canGoBack} onClick={onGoBack}>
        <LuArrowLeft size={14} />
      </IconButton>
      <IconButton aria-label="Go forward" disabled={!canGoForward} onClick={onGoForward}>
        <LuArrowRight size={14} />
      </IconButton>
      <IconButton aria-label="Reload page" onClick={onReload}>
        <LuRefreshCcw size={14} />
      </IconButton>
      <TextField
        ref={textFieldRef}
        size="small"
        value={displayUrl}
        onChange={(event) => {
          onUrlChange(event.target.value);
          onSetHighlightIndex(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Search or enter URL"
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start" sx={{ mr: 0.5, ml: -0.25 }}>
              {isHttps ? (
                <LuLock size={12} color="#4caf50" />
              ) : isHttp ? (
                <LuLockOpen size={12} color="#ff9800" />
              ) : null}
            </InputAdornment>
          ),
        }}
        sx={{
          "& .MuiInputBase-input": {
            py: 0.75,
            fontSize: 13,
            color: urlFocused ? "text.primary" : "text.secondary",
          },
        }}
      />
      <Popper open={urlFocused && historyGroups.length > 0} anchorEl={textFieldRef.current} placement="bottom-start" style={{ zIndex: 1300 }}>
        <Paper
          sx={{
            mt: 0.5,
            maxHeight: 320,
            overflowY: "auto",
            width: textFieldRef.current?.offsetWidth ?? 300,
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <MenuList dense>
            {historyGroups.map((group) => {
              const entries = filteredHistory.filter((e) => {
                try {
                  return new URL(e.url).host === group.host;
                } catch {
                  return false;
                }
              });
              if (entries.length === 0) {
                return null;
              }
              return [
                <MenuItem key={`header-${group.host}`} disabled sx={{ opacity: 1, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, minHeight: 28 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    {group.faviconUrl ? (
                      <img src={group.faviconUrl} alt="" width={14} height={14} style={{ objectFit: "contain" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <LuGlobe size={13} />
                    )}
                  </ListItemIcon>
                  <Box sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.host}</Box>
                </MenuItem>,
                ...entries.map((entry) => {
                  const flatIdx = filteredHistory.indexOf(entry);
                  return (
                    <MenuItem
                      key={entry.url}
                      selected={flatIdx === highlightIndex}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onNavigateTo(entry.url);
                      }}
                      onMouseEnter={() => onSetHighlightIndex(flatIdx)}
                      sx={{ pl: 5, py: 0.5 }}
                    >
                      <ListItemText
                        primary={entry.title}
                        secondary={entry.url}
                        sx={{ minWidth: 0 }}
                        primaryTypographyProps={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        secondaryTypographyProps={{ fontSize: 11, color: "text.disabled", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      />
                    </MenuItem>
                  );
                }),
              ];
            })}
          </MenuList>
        </Paper>
      </Popper>
      <Tooltip title="Open in system default browser" arrow>
        <IconButton
          aria-label="Open in system default browser"
          disabled={!resolvedUrl}
          onClick={() => {
            void openExternalUrl(resolvedUrl);
          }}
        >
          <RxExternalLink size={14} />
        </IconButton>
      </Tooltip>
      <IconButton aria-label="Browser tools" onClick={onToolsClick}>
        {children}
      </IconButton>
    </Box>
  );
}
