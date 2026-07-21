import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuHistory } from "react-icons/lu";
import { fetchSessionHistory } from "../../commands/agentChatCommands";
import { formatAgentSessionTitle } from "../../helpers/agentSkillTextHelpers";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import type * as Rpc from "../../rpc/daemonTypes";

const RECENT_SESSION_LIMIT = 5;

type RecentAgentSessionsProps = {
  workspaceId: string;
  cwd?: string;
};

function formatRelativeTime(timestamp: string, t: (key: string, options?: { count: number }) => string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const elapsedMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (elapsedMinutes < 1) return t("launch.recent.now");
  if (elapsedMinutes < 60) return t("launch.recent.minutesAgo", { count: elapsedMinutes });
  if (elapsedMinutes < 24 * 60) return t("launch.recent.hoursAgo", { count: Math.floor(elapsedMinutes / 60) });
  if (elapsedMinutes < 7 * 24 * 60)
    return t("launch.recent.daysAgo", { count: Math.floor(elapsedMinutes / (24 * 60)) });
  return date.toLocaleDateString();
}

/** Lists recent Pi sessions for a workspace when no tabs are open. */
export function RecentAgentSessions({ workspaceId, cwd }: RecentAgentSessionsProps) {
  const { t } = useTranslation();
  const { openTab } = useCommands();
  const [sessions, setSessions] = useState<Rpc.PiSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(cwd));
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!cwd) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSessions((await fetchSessionHistory(cwd)).slice(0, RECENT_SESSION_LIMIT));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  if (!cwd) {
    return null;
  }

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        p: 1.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1, color: "text.secondary" }}>
        <LuHistory size={16} aria-hidden />
        <Typography variant="body2">{t("launch.recent.title")}</Typography>
      </Box>
      {isLoading ? <CircularProgress size={18} /> : null}
      {error ? (
        <Typography variant="caption" color="error.main">
          {t("launch.recent.loadError")}: {error}
        </Typography>
      ) : null}
      {!isLoading && !error && sessions.length === 0 ? (
        <Typography variant="caption" color="text.disabled">
          {t("launch.recent.empty")}
        </Typography>
      ) : null}
      {!isLoading && !error && sessions.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {sessions.map((session) => {
            const title = formatAgentSessionTitle(session.previewText || "") || t("launch.recent.defaultTitle");
            return (
              <Button
                key={session.sessionId}
                variant="text"
                color="inherit"
                onClick={() => openTab({ workspaceId, kind: "agent-chat", title, cwd, sessionId: session.sessionId })}
                sx={{ justifyContent: "space-between", textTransform: "none", textAlign: "left" }}
              >
                <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </Box>
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
                  {formatRelativeTime(session.timestamp, t)}
                </Typography>
              </Button>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}
