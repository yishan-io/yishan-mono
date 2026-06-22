import { clearWorkspaceBrowserStoredState } from "@/features/workspaces/browser/state/workspaceBrowserState";
import { saveStoredShellState, saveStoredTerminalRuntimeState } from "@/lib/storage/shell-state-storage";
import {
  buildStoredShellStateSnapshot,
  listWorkspaceBrowserStateIdsForCleanup,
} from "./shell-state-maintenance-persistence-domain";

type PersistShellStateCleanupInput = {
  nextPaneLayoutByWorkspaceId: Record<string, import("./shell.types").WorkspacePaneLayoutState>;
  nextTerminalsByWorkspaceId: Record<string, import("./shell.types").TerminalItem[]>;
  nextWorkspaceTabStateByWorkspaceId: Record<string, import("./shell.types").ShellWorkspaceTabState>;
  organizationId: string;
  projectId: string;
  selectedNodeIdByOrganization: Record<string, string>;
  workspaceIds: string[];
};

export async function persistShellStateCleanup(input: PersistShellStateCleanupInput) {
  await Promise.all([
    ...listWorkspaceBrowserStateIdsForCleanup(input.organizationId, input.projectId, input.workspaceIds).map(
      (stateId) => clearWorkspaceBrowserStoredState(stateId),
    ),
    saveStoredShellState(buildStoredShellStateSnapshot(input)),
    saveStoredTerminalRuntimeState(input.nextTerminalsByWorkspaceId),
  ]);
}
