import { closeTab, tabStore } from "@renderer/domains/workbench";
import type { TerminalSessionLifecycleEvent } from "../../daemon/terminalWireTypes";
import type { TerminalSessionSummary } from "../../daemon/terminalWireTypes";

/** One stable React key per terminal session row. */
export function buildSessionActionKey(sessionId: string): string {
  return sessionId.trim();
}

/** Applies one lifecycle event to session state while preserving deterministic session ordering. */
export function applyLifecycleEvent(
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
export function sortTerminalSessions(sessions: TerminalSessionSummary[]): TerminalSessionSummary[] {
  return [...sessions].sort((left, right) => left.sessionId.localeCompare(right.sessionId));
}

/** Closes workspace terminal tabs backed by one stopped daemon session. */
export function closeTerminalTabsForSession(sessionId: string): void {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return;
  }

  const tabIds = tabStore
    .getState()
    .tabs.filter((tab) => tab.kind === "terminal" && tab.data.sessionId?.trim() === normalizedSessionId)
    .map((tab) => tab.id);

  for (const tabId of tabIds) {
    closeTab(tabId);
  }
}

/** Resolves one display pair of workspace and repo names for one terminal session. */
export function resolveSessionLocationLabel(input: {
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
