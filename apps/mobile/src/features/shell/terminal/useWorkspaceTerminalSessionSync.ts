import { useCallback, useEffect, useRef, useState } from "react";

import type { AuthStatus } from "@/features/auth";
import { listWorkspaceTerminalSessions } from "@/features/workspaces/workspaces.api";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { logMobileDebug } from "@/lib/debug/mobileDebug";
import { isClosedBackendSessionSuppressed } from "../state/shell-closed-backend-session-guard";
import type { TerminalItem } from "../state/shell.types";
import {
  reconcileWorkspaceTerminalSessionSync,
  resolveWorkspaceTerminalSessionSyncReset,
  shouldAutoSyncWorkspaceTerminalSession,
} from "./workspace-terminal-session-sync-domain";

const inFlightWorkspaceTerminalSessionSyncs = new Map<string, Promise<void>>();

function summarizeLocalTerminals(terminals: TerminalItem[]) {
  return terminals.map((terminal) => ({
    id: terminal.id,
    importedFromBackend: terminal.importedFromBackend === true,
    label: terminal.label,
    sessionId: terminal.session?.sessionId ?? null,
    status: terminal.status ?? null,
  }));
}

/**
 * Loads one backend session snapshot for cold start, reconnect, and manual
 * refresh so mobile can repair local terminal state after missed live events.
 */
export function useWorkspaceTerminalSessionSync({
  accessToken,
  enabled,
  removeTerminal,
  status,
  syncWorkspaceTerminalTabs,
  t,
  terminalsByWorkspaceId,
  upsertTerminal,
  workspace,
  workspaceLabel,
}: {
  accessToken: string | null;
  enabled: boolean;
  removeTerminal: (workspaceId: string, terminalId: string) => void;
  status: AuthStatus;
  syncWorkspaceTerminalTabs: (input: {
    terminals: TerminalItem[];
    terminalIdsToRemove?: string[];
    workspace: {
      id: string;
      nodeId?: string | null;
      organizationId: string;
      projectId: string;
    };
    workspaceLabel: string | null;
  }) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
  upsertTerminal: (workspaceId: string, terminal: TerminalItem) => void;
  workspace: (Pick<Workspace, "id" | "organizationId" | "projectId"> & { nodeId?: string | null }) | null;
  workspaceLabel: string | null;
}) {
  const lastSyncedWorkspaceKeyRef = useRef<string | null>(null);
  const [isRefreshingSessionSync, setIsRefreshingSessionSync] = useState(false);

  const refreshSessionSync = useCallback(async () => {
    if (!enabled || status !== "authenticated" || !accessToken || !workspace) {
      return;
    }

    const workspaceKey = `${workspace.organizationId}:${workspace.projectId}:${workspace.id}`;
    const existingSync = inFlightWorkspaceTerminalSessionSyncs.get(workspaceKey);
    if (existingSync) {
      setIsRefreshingSessionSync(true);

      try {
        await existingSync;
      } finally {
        setIsRefreshingSessionSync(false);
      }

      return;
    }

    const localTerminals = terminalsByWorkspaceId[workspace.id] ?? [];
    const syncPromise = (async () => {
      logMobileDebug("terminal.sync", "request", {
        localTerminalCount: localTerminals.length,
        localTerminals: summarizeLocalTerminals(localTerminals),
        workspaceId: workspace.id,
      });

      try {
        const sessions = await listWorkspaceTerminalSessions(
          accessToken,
          workspace.organizationId,
          workspace.projectId,
          workspace.id,
        );
        logMobileDebug("terminal.sync", "success", {
          sessions: sessions.map((session) => ({
            paneId: session.paneId ?? null,
            sessionId: session.sessionId,
            status: session.status,
            tabId: session.tabId ?? null,
          })),
          workspaceId: workspace.id,
        });

        const syncPlan = reconcileWorkspaceTerminalSessionSync({
          localTerminals,
          sessions,
          suppressedSessionIds: new Set(
            sessions
              .filter((session) => isClosedBackendSessionSuppressed(workspace.id, session.sessionId))
              .map((session) => session.sessionId),
          ),
          t,
          workspace,
          workspaceLabel,
        });
        logMobileDebug("terminal.sync", "plan", {
          syncedTerminalIds: syncPlan.syncedTerminalIds,
          syncedTerminals: summarizeLocalTerminals(syncPlan.syncedTerminals),
          terminalIdsToRemove: syncPlan.terminalIdsToRemove,
          workspaceId: workspace.id,
        });

        for (const terminal of syncPlan.syncedTerminals) {
          upsertTerminal(workspace.id, terminal);
        }

        syncWorkspaceTerminalTabs({
          terminalIdsToRemove: syncPlan.terminalIdsToRemove,
          terminals: syncPlan.syncedTerminals,
          workspace,
          workspaceLabel,
        });

        for (const terminalId of syncPlan.terminalIdsToRemove) {
          removeTerminal(workspace.id, terminalId);
        }
      } catch (error) {
        logMobileDebug("terminal.sync", "error", {
          error,
          workspaceId: workspace.id,
        });
      }
    })();

    inFlightWorkspaceTerminalSessionSyncs.set(workspaceKey, syncPromise);
    setIsRefreshingSessionSync(true);

    try {
      await syncPromise;
    } finally {
      if (inFlightWorkspaceTerminalSessionSyncs.get(workspaceKey) === syncPromise) {
        inFlightWorkspaceTerminalSessionSyncs.delete(workspaceKey);
      }
      setIsRefreshingSessionSync(false);
    }
  }, [
    accessToken,
    enabled,
    removeTerminal,
    status,
    syncWorkspaceTerminalTabs,
    t,
    terminalsByWorkspaceId,
    upsertTerminal,
    workspace,
    workspaceLabel,
  ]);

  useEffect(() => {
    const workspaceKey = workspace ? `${workspace.organizationId}:${workspace.projectId}:${workspace.id}` : null;
    const syncReset = resolveWorkspaceTerminalSessionSyncReset({
      accessToken,
      enabled,
      status,
      workspaceKey,
    });

    if (syncReset.shouldReset) {
      lastSyncedWorkspaceKeyRef.current = null;
      return;
    }

    if (!syncReset.nextWorkspaceKey || !workspace) {
      return;
    }

    if (
      !shouldAutoSyncWorkspaceTerminalSession({
        lastSyncedWorkspaceKey: lastSyncedWorkspaceKeyRef.current,
        workspaceKey: syncReset.nextWorkspaceKey,
      })
    ) {
      return;
    }

    lastSyncedWorkspaceKeyRef.current = syncReset.nextWorkspaceKey;
    let cancelled = false;

    void (async () => {
      await refreshSessionSync();
      if (cancelled) {
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, refreshSessionSync, status, workspace]);

  return {
    isRefreshingSessionSync,
    refreshSessionSync,
  };
}
