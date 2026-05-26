import { Alert, Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { StatusIndicator } from "../../components/StatusIndicator";
import { SettingsCard, SettingsRows, SettingsSectionHeader, SettingsToggleRow } from "../../components/settings";
import { MONOSPACE_SX } from "../../helpers/styles";
import { useCommands } from "../../hooks/useCommands";
import { layoutStore } from "../../store/settings/layoutStore";
import type { TerminalSessionLifecycleEvent, TerminalSessionSummary } from "../../rpc/daemonTypes";
import { tabStore } from "../../store/tabStore";
import { workspaceStore } from "../../store/workspaceStore";

/** Builds one stable map key for in-flight close action tracking. */
function buildSessionActionKey(sessionId: string): string {
  return sessionId.trim();
}

/** Applies one lifecycle event to session state while preserving deterministic session ordering. */
function applyLifecycleEvent(
  previousSessions: TerminalSessionSummary[],
  event: TerminalSessionLifecycleEvent,
): TerminalSessionSummary[] {
  const sessionById = new Map(previousSessions.map((session) => [session.sessionId, session]));
  if (event.type === "session.exited" || event.session.status === "exited") {
    sessionById.delete(event.session.sessionId);
  } else {
    sessionById.set(event.session.sessionId, event.session);
  }
  return sortTerminalSessions(Array.from(sessionById.values()));
}

/** Sorts terminal sessions by session id for stable rendering. */
function sortTerminalSessions(sessions: TerminalSessionSummary[]): TerminalSessionSummary[] {
  return [...sessions].sort((left, right) => left.sessionId.localeCompare(right.sessionId));
}

/** Closes workspace terminal tabs backed by one stopped daemon session. */
function closeTerminalTabsForSession(sessionId: string): void {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return;
  }

  const tabState = tabStore.getState();
  const tabIds = tabState.tabs
    .filter((tab) => tab.kind === "terminal" && tab.data.sessionId?.trim() === normalizedSessionId)
    .map((tab) => tab.id);

  for (const tabId of tabIds) {
    tabStore.getState().closeTab(tabId);
  }
}

/** Resolves one display pair of workspace and repo names for one terminal session. */
function resolveSessionLocationLabel(input: {
  session: TerminalSessionSummary;
  workspaceNameById: Map<string, string>;
  workspaceRepoIdByWorkspaceId: Map<string, string>;
  repoNameById: Map<string, string>;
  unknownWorkspaceLabel: string;
  unknownRepoLabel: string;
}): { workspaceName: string; repoName: string } {
  const workspaceId = input.session.workspaceId?.trim();
  if (!workspaceId) {
    return {
      workspaceName: input.unknownWorkspaceLabel,
      repoName: input.unknownRepoLabel,
    };
  }

  const workspaceName = input.workspaceNameById.get(workspaceId) ?? input.unknownWorkspaceLabel;
  const repoId = input.workspaceRepoIdByWorkspaceId.get(workspaceId);
  const repoName = repoId ? (input.repoNameById.get(repoId) ?? input.unknownRepoLabel) : input.unknownRepoLabel;
  return {
    workspaceName,
    repoName,
  };
}

/** Renders one settings panel for globally listing and managing terminal sessions. */
export function TerminalSettingsView() {
  const { t } = useTranslation();
  const { closeTerminalSession, listTerminalSessions, subscribeTerminalSessions } = useCommands();
  const isVoiceInputEnabled = layoutStore((state) => state.isVoiceInputEnabled);
  const setIsVoiceInputEnabled = layoutStore((state) => state.setIsVoiceInputEnabled);
  const voiceAutoEnter = layoutStore((state) => state.voiceAutoEnter);
  const setVoiceAutoEnter = layoutStore((state) => state.setVoiceAutoEnter);
  const projects = workspaceStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
  const [closingSessionIds, setClosingSessionIds] = useState<Set<string>>(new Set());
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    /** Loads one latest session snapshot and wires one live lifecycle subscription. */
    const initializeSessions = async () => {
      try {
        setHasLoadError(false);
        const initialSessions = await listTerminalSessions();
        if (!cancelled) {
          setSessions(sortTerminalSessions(initialSessions));
        }
      } catch (error) {
        console.error("[TerminalSettingsView] Failed to load terminal sessions", error);
        if (!cancelled) {
          setHasLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }

      try {
        const subscription = await subscribeTerminalSessions({
          onData: (event) => {
            setSessions((previousSessions) => applyLifecycleEvent(previousSessions, event));
          },
          onError: (error) => {
            console.error("[TerminalSettingsView] Failed to subscribe terminal sessions", error);
          },
        });
        if (cancelled) {
          subscription.unsubscribe();
          return;
        }
        subscriptionRef.current = subscription;
      } catch (error) {
        console.error("[TerminalSettingsView] Failed to subscribe terminal sessions", error);
      }
    };

    void initializeSessions();

    return () => {
      cancelled = true;
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [listTerminalSessions, subscribeTerminalSessions]);

  const repoNameById = useMemo(() => {
    return new Map(projects.map((repo) => [repo.id, repo.name]));
  }, [projects]);
  const workspaceNameById = useMemo(() => {
    return new Map(workspaces.map((workspace) => [workspace.id, workspace.title]));
  }, [workspaces]);
  const workspaceRepoIdByWorkspaceId = useMemo(() => {
    return new Map(workspaces.map((workspace) => [workspace.id, workspace.repoId]));
  }, [workspaces]);
  const groupedSessions = useMemo(() => {
    const groups = new Map<
      string,
      {
        projectName: string;
        sessions: Array<{
          session: TerminalSessionSummary;
          workspaceName: string;
          actionKey: string;
          isClosing: boolean;
          isRunning: boolean;
        }>;
      }
    >();

    for (const session of sessions) {
      const location = resolveSessionLocationLabel({
        session,
        repoNameById,
        workspaceNameById,
        workspaceRepoIdByWorkspaceId,
        unknownWorkspaceLabel: t("settings.terminal.unknownWorkspace"),
        unknownRepoLabel: t("settings.terminal.unknownRepo"),
      });
      const projectName = location.repoName;
      const groupKey = projectName.trim().toLowerCase();
      const existing = groups.get(groupKey);
      const sessionRow = {
        session,
        workspaceName: location.workspaceName,
        actionKey: buildSessionActionKey(session.sessionId),
        isClosing: closingSessionIds.has(buildSessionActionKey(session.sessionId)),
        isRunning: session.status === "running",
      };

      if (existing) {
        existing.sessions.push(sessionRow);
        continue;
      }

      groups.set(groupKey, {
        projectName,
        sessions: [sessionRow],
      });
    }

    return Array.from(groups.values()).sort((left, right) => left.projectName.localeCompare(right.projectName));
  }, [closingSessionIds, repoNameById, sessions, t, workspaceNameById, workspaceRepoIdByWorkspaceId]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <SettingsSectionHeader
          title={t("settings.terminal.voice.title")}
          description={t("settings.terminal.voice.description")}
        />
        <SettingsCard>
          <SettingsRows>
            <SettingsToggleRow
              title={t("settings.terminal.voice.enable.label")}
              description={t("settings.terminal.voice.enable.description")}
              checked={isVoiceInputEnabled}
              onChange={setIsVoiceInputEnabled}
            />
            <SettingsToggleRow
              title={t("settings.terminal.voice.autoEnter.label")}
              description={t("settings.terminal.voice.autoEnter.description")}
              checked={voiceAutoEnter}
              onChange={setVoiceAutoEnter}
            />
          </SettingsRows>
        </SettingsCard>
      </Box>
      <SettingsSectionHeader title={t("settings.terminal.title")} description={t("settings.terminal.description")} />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.terminal.loadError")}</Alert> : null}
            <Table
              size="small"
              sx={{
                mt: hasLoadError ? 1.5 : 0,
                "& th": {
                  fontWeight: 600,
                  borderBottomColor: "divider",
                },
                "& th, & td": {
                  borderBottomColor: "divider",
                },
                "& tbody tr:last-of-type td": {
                  borderBottom: "none",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.terminal.columns.session")}</TableCell>
                  <TableCell>{t("settings.terminal.columns.workspace")}</TableCell>
                  <TableCell>{t("settings.terminal.columns.pid")}</TableCell>
                  <TableCell>{t("settings.terminal.columns.status")}</TableCell>
                  <TableCell align="right">{t("settings.terminal.columns.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {t("settings.terminal.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedSessions.flatMap((group) => [
                    <TableRow key={`group-${group.projectName}`}>
                      <TableCell colSpan={5} sx={{ py: 1, bgcolor: "background.default", fontWeight: 600 }}>
                        {group.projectName}
                      </TableCell>
                    </TableRow>,
                    ...group.sessions.map(({ session, workspaceName, actionKey, isClosing, isRunning }) => (
                      <TableRow key={session.sessionId}>
                        <TableCell sx={MONOSPACE_SX}>{session.sessionId}</TableCell>
                        <TableCell>{workspaceName}</TableCell>
                        <TableCell sx={MONOSPACE_SX}>{session.pid}</TableCell>
                        <TableCell>
                          <StatusIndicator
                            label={
                              isRunning ? t("settings.terminal.status.running") : t("settings.terminal.status.exited")
                            }
                            color={isRunning ? "success" : "disabled"}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            color="error"
                            disabled={!isRunning || isClosing}
                            onClick={() => {
                              setClosingSessionIds((previous) => {
                                const next = new Set(previous);
                                next.add(actionKey);
                                return next;
                              });

                              void closeTerminalSession({ sessionId: session.sessionId })
                                .then(() => {
                                  setSessions((previousSessions) =>
                                    previousSessions.filter((candidate) => candidate.sessionId !== session.sessionId),
                                  );
                                  closeTerminalTabsForSession(session.sessionId);
                                })
                                .catch((error) => {
                                  console.error("[TerminalSettingsView] Failed to close terminal session", error);
                                })
                                .finally(() => {
                                  setClosingSessionIds((previous) => {
                                    const next = new Set(previous);
                                    next.delete(actionKey);
                                    return next;
                                  });
                                });
                            }}
                          >
                            {isClosing ? t("settings.terminal.actions.killing") : t("settings.terminal.actions.kill")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )),
                  ])
                )}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>
    </Box>
  );
}
