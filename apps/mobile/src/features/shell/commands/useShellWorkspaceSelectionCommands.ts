import { useCallback } from "react";

import type { TerminalItem, WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import {
  sanitizeWorkspacePaneStoreState,
  upsertWorkspaceTerminalTabsStoreState,
} from "../state/shell-pane-state-machine";
import { syncTerminalMapForWorkspaceTabs } from "../state/shell-stored-state-helpers";

type StoredState = {
  setTerminalsByWorkspaceId: (
    updater: (current: Record<string, TerminalItem[]>) => Record<string, TerminalItem[]>,
  ) => void;
  terminalsByWorkspaceId: Record<string, TerminalItem[]>;
};

type SyncWorkspaceSelectionState = (input: {
  includePreviewRoute?: boolean;
  nodeId: string | null;
  orgId: string;
  projectId: string;
  workspaceId: string;
  nextStoreState: WorkspacePaneStoreState;
}) => void;

export function useShellWorkspaceSelectionCommands({
  getWorkspacePaneStoreState,
  storedState,
  syncWorkspaceSelectionState,
  writeWorkspacePaneStoreState,
}: {
  getWorkspacePaneStoreState: (workspaceId: string) => WorkspacePaneStoreState;
  storedState: StoredState;
  syncWorkspaceSelectionState: SyncWorkspaceSelectionState;
  writeWorkspacePaneStoreState: (workspaceId: string, nextStoreState: WorkspacePaneStoreState) => void;
}) {
  const selectWorkspace = useCallback(
    (workspace: {
      id: Workspace["id"];
      organizationId: Workspace["organizationId"];
      projectId: Workspace["projectId"];
      nodeId: Workspace["nodeId"];
    }) => {
      const nextStoreState = sanitizeWorkspacePaneStoreState(getWorkspacePaneStoreState(workspace.id), workspace.id);
      storedState.setTerminalsByWorkspaceId((current) =>
        syncTerminalMapForWorkspaceTabs(current, {
          nodeId: workspace.nodeId ?? null,
          orgId: workspace.organizationId,
          projectId: workspace.projectId,
          tabState: nextStoreState.tabState,
          workspaceId: workspace.id,
          workspaceLabel: null,
        }),
      );

      syncWorkspaceSelectionState({
        includePreviewRoute: false,
        nextStoreState,
        nodeId: workspace.nodeId,
        orgId: workspace.organizationId,
        projectId: workspace.projectId,
        workspaceId: workspace.id,
      });
    },
    [getWorkspacePaneStoreState, storedState, syncWorkspaceSelectionState],
  );

  const syncWorkspaceTerminalTabs = useCallback(
    (input: {
      terminals: TerminalItem[];
      terminalIdsToRemove?: string[];
      workspace: {
        id: string;
        nodeId?: string | null;
        organizationId: string;
        projectId: string;
      };
      workspaceLabel: string | null;
    }) => {
      const nextStoreState = upsertWorkspaceTerminalTabsStoreState(
        getWorkspacePaneStoreState(input.workspace.id),
        input.workspace.id,
        input.terminals,
        { terminalIdsToRemove: input.terminalIdsToRemove },
      );
      writeWorkspacePaneStoreState(input.workspace.id, nextStoreState);
      storedState.setTerminalsByWorkspaceId((current) =>
        syncTerminalMapForWorkspaceTabs(current, {
          nodeId: input.workspace.nodeId ?? null,
          orgId: input.workspace.organizationId,
          projectId: input.workspace.projectId,
          tabState: nextStoreState.tabState,
          workspaceId: input.workspace.id,
          workspaceLabel: input.workspaceLabel,
        }),
      );
    },
    [getWorkspacePaneStoreState, storedState, writeWorkspacePaneStoreState],
  );

  return {
    selectWorkspace,
    syncWorkspaceTerminalTabs,
  };
}
