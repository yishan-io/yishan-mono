import { useCallback, useEffect, useMemo, useRef } from "react";

import { useWorkspaceFrontendEventsStream } from "@/features/workspaces/useWorkspaceFrontendEventsStream";
import type { WorkspaceFrontendEventsMessage } from "@/features/workspaces/workspace-frontend-events";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { logMobileDebug } from "@/lib/debug/mobileDebug";

import type { TerminalItem } from "../state/shell.types";
import {
  readWorkspaceTerminalSessionLifecycleEvent,
  reconcileWorkspaceTerminalSessionLifecycleEvent,
} from "./workspace-terminal-session-lifecycle-domain";

export function useWorkspaceTerminalLifecycleEvents({
  accessToken,
  enabled,
  removeTerminal,
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
  const latestStateRef = useRef({
    removeTerminal,
    syncWorkspaceTerminalTabs,
    t,
    terminalsByWorkspaceId,
    upsertTerminal,
    workspace,
    workspaceLabel,
  });

  useEffect(() => {
    latestStateRef.current = {
      removeTerminal,
      syncWorkspaceTerminalTabs,
      t,
      terminalsByWorkspaceId,
      upsertTerminal,
      workspace,
      workspaceLabel,
    };
  }, [removeTerminal, syncWorkspaceTerminalTabs, t, terminalsByWorkspaceId, upsertTerminal, workspace, workspaceLabel]);

  const nodes = useMemo(() => {
    if (!workspace?.nodeId) {
      return [];
    }

    return [
      {
        nodeId: workspace.nodeId,
        orgId: workspace.organizationId,
        projectId: workspace.projectId,
        workspaceId: workspace.id,
      },
    ];
  }, [workspace?.id, workspace?.nodeId, workspace?.organizationId, workspace?.projectId]);

  const handleMessage = useCallback(({ message }: { message: WorkspaceFrontendEventsMessage }) => {
    const {
      removeTerminal: currentRemoveTerminal,
      syncWorkspaceTerminalTabs: currentSyncWorkspaceTerminalTabs,
      t: currentTranslate,
      terminalsByWorkspaceId: currentTerminalsByWorkspaceId,
      upsertTerminal: currentUpsertTerminal,
      workspace: currentWorkspace,
      workspaceLabel: currentWorkspaceLabel,
    } = latestStateRef.current;

    if (!currentWorkspace) {
      return;
    }

    const event = readWorkspaceTerminalSessionLifecycleEvent(message);
    if (!event || event.workspaceId !== currentWorkspace.id) {
      return;
    }
    logMobileDebug("terminal.lifecycle", "event", {
      action: event.action,
      paneId: event.paneId ?? null,
      sessionId: event.sessionId,
      status: event.status,
      tabId: event.tabId ?? null,
      workspaceId: event.workspaceId,
    });

    const result = reconcileWorkspaceTerminalSessionLifecycleEvent({
      event,
      localTerminals: currentTerminalsByWorkspaceId[currentWorkspace.id] ?? [],
      t: currentTranslate,
      workspace: currentWorkspace,
      workspaceLabel: currentWorkspaceLabel,
    });
    if (!result.changed) {
      return;
    }
    logMobileDebug("terminal.lifecycle", "plan", {
      nextTerminalIds: result.nextTerminalIds,
      terminalIdsToRemove: result.terminalIdsToRemove,
      terminalsToUpsert: result.terminalsToUpsert.map((terminal) => ({
        id: terminal.id,
        importedFromBackend: terminal.importedFromBackend === true,
        label: terminal.label,
        sessionId: terminal.session?.sessionId ?? null,
        status: terminal.status ?? null,
      })),
      workspaceId: currentWorkspace.id,
    });

    for (const terminal of result.terminalsToUpsert) {
      currentUpsertTerminal(currentWorkspace.id, terminal);
    }
    currentSyncWorkspaceTerminalTabs({
      terminalIdsToRemove: result.terminalIdsToRemove,
      terminals: result.terminalsToUpsert,
      workspace: currentWorkspace,
      workspaceLabel: currentWorkspaceLabel,
    });
    for (const terminalId of result.terminalIdsToRemove) {
      currentRemoveTerminal(currentWorkspace.id, terminalId);
    }
  }, []);

  useWorkspaceFrontendEventsStream({
    accessToken,
    enabled: enabled && nodes.length > 0,
    nodes,
    onMessage: handleMessage,
  });
}
