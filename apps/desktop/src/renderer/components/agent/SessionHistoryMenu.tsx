import { Box, Menu, MenuItem, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSessionHistory } from "../../commands/agentChatCommands";
import { formatAgentSessionTitle } from "../../helpers/agentSkillTextHelpers";
import { getErrorMessage } from "../../helpers/errorHelpers";
import type * as Rpc from "../../rpc/daemonTypes";

type SessionHistoryMenuProps = {
  cwd: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelectSession?: (sessionId: string, title: string) => void;
};

/** Formats a timestamp as a relative label (e.g. "2h ago", "yesterday"). */
function relativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/** Popover menu listing past session summaries for one workspace. */
export function SessionHistoryMenu({ cwd, anchorEl, onClose, onSelectSession }: SessionHistoryMenuProps) {
  const [sessions, setSessions] = useState<Rpc.PiSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadSessions = useCallback(async () => {
    try {
      setError(null);
      const summaries = await fetchSessionHistory(cwd);
      if (!mountedRef.current) return;
      setSessions(summaries);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(getErrorMessage(err));
    }
  }, [cwd]);

  useEffect(() => {
    if (!anchorEl) return;
    mountedRef.current = true;
    loadSessions();
    return () => {
      mountedRef.current = false;
    };
  }, [anchorEl, loadSessions]);

  const open = Boolean(anchorEl);

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{ paper: { sx: { maxWidth: 360, maxHeight: 320 } } }}
    >
      {error && (
        <MenuItem disabled>
          <Typography variant="body2" color="text.secondary">
            Failed to load history
          </Typography>
        </MenuItem>
      )}

      {!error && sessions.length === 0 && (
        <MenuItem disabled sx={{ flexDirection: "column", alignItems: "flex-start" }}>
          <Typography variant="body2" color="text.secondary">
            No past sessions
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ wordBreak: "break-all", maxWidth: 320 }}>
            cwd: {cwd}
          </Typography>
        </MenuItem>
      )}

      {sessions.map((session) => {
        const formattedTitle = formatAgentSessionTitle(session.previewText || "");

        return (
          <MenuItem
            key={session.sessionId}
            onClick={() => {
              onSelectSession?.(session.sessionId, formattedTitle);
              onClose();
            }}
            dense
            sx={{ minWidth: 280 }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", width: "100%", gap: 0.25 }}>
              <Typography variant="body2" noWrap>
                {formattedTitle || "(empty)"}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {relativeTime(session.timestamp)}
                </Typography>
                {session.model && (
                  <Typography variant="caption" color="text.disabled">
                    {session.model}
                  </Typography>
                )}
              </Box>
            </Box>
          </MenuItem>
        );
      })}
    </Menu>
  );
}
