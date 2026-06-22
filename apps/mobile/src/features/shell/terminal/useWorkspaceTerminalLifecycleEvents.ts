import { useCallback, useMemo } from "react";

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
  }, [workspace]);

  const handleMessage = useCallback(
    ({ message }: { message: WorkspaceFrontendEventsMessage }) => {
      if (!workspace) {
        return;
      }

      const event = readWorkspaceTerminalSessionLifecycleEvent(message);
      if (!event || event.workspaceId !== workspace.id) {
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
        localTerminals: terminalsByWorkspaceId[workspace.id] ?? [],
        t,
        workspace,
        workspaceLabel,
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
        workspaceId: workspace.id,
      });

      for (const terminal of result.terminalsToUpsert) {
        upsertTerminal(workspace.id, terminal);
      }
      syncWorkspaceTerminalTabs({
        terminalIdsToRemove: result.terminalIdsToRemove,
        terminals: result.terminalsToUpsert,
        workspace,
        workspaceLabel,
      });
      for (const terminalId of result.terminalIdsToRemove) {
        removeTerminal(workspace.id, terminalId);
      }
    },
    [removeTerminal, syncWorkspaceTerminalTabs, t, terminalsByWorkspaceId, upsertTerminal, workspace, workspaceLabel],
  );

  useWorkspaceFrontendEventsStream({
    accessToken,
    enabled: enabled && nodes.length > 0,
    nodes,
    onMessage: handleMessage,
  });
}
