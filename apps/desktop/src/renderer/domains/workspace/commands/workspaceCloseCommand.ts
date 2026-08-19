import { projectStore } from "@renderer/domains/project";
import { removeRightPaneStateForWorkspace } from "@renderer/domains/workbench";

import { syncTabStoreWithWorkspace } from "../../../domains/workspace/commands/workspaceTabSync";
import { enqueueWorkspaceErrorNotice } from "../../../domains/workspace/state/workspaceLifecycleNoticeStore";
import type { WorkspaceLifecycleScriptWarning } from "../../../domains/workspace/state/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { getWorkspaceRpc } from "../daemon/daemonWorkspaceClient";
import { isFolderWorkspace } from "../localFolder";
import { deleteLocalFolder } from "./localFolderCommands";
import { notifyLifecycleScriptWarnings } from "./workspaceCreateCommand";
import { sessionStore } from "@renderer/domains/session";

type CloseWorkspaceResponse = {
  workspace: { id: string; status: string };
  workspaceId: string;
  lifecycleScriptWarnings: WorkspaceLifecycleScriptWarning[];
  terminalCleanupErrors?: string[];
};

function formatWorkspaceCloseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Workspace close failed.";
  const daemonPrefixMatch = message.match(/^daemon RPC error -?\d+:\s*(.*)$/s);
  return daemonPrefixMatch?.[1]?.trim() || message;
}

function notifyWorkspaceCloseFailure(input: { workspaceName?: string; error: unknown }): void {
  const workspaceName = input.workspaceName?.trim();
  const title = "Failed to close workspace";
  const workspaceLabel = workspaceName ? `Workspace "${workspaceName}"` : "The workspace";
  const message = `${workspaceLabel} was not closed. Try closing it again. ${formatWorkspaceCloseError(input.error)}`;

  enqueueWorkspaceErrorNotice({ title, message });
}

/** Runs backend workspace-close cleanup without blocking UI state updates. */
async function removeWorkspaceInBackground(input: {
  workspaceId: string;
  workspaceName: string;
  organizationId?: string;
  projectId?: string;
  branch?: string;
  removeBranch?: boolean;
  postHook?: string;
}): Promise<void> {
  const workspaceRpc = await getWorkspaceRpc();

  const closed = (await workspaceRpc.close({
    workspaceId: input.workspaceId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    branch: input.branch,
    removeBranch: input.removeBranch,
    postHook: input.postHook,
  })) as CloseWorkspaceResponse | undefined;
  if (!closed) {
    return;
  }
  notifyLifecycleScriptWarnings(input.workspaceName, closed.lifecycleScriptWarnings, "post", input.postHook || "");
  if (closed.terminalCleanupErrors && closed.terminalCleanupErrors.length > 0) {
    const details = closed.terminalCleanupErrors.join("; ");
    enqueueWorkspaceErrorNotice({
      title: "Some processes did not shut down cleanly",
      message: `Workspace "${input.workspaceName}" closed, but ${closed.terminalCleanupErrors.length} process(es) could not be terminated. Ports or resources may still be in use. Details: ${details}`,
    });
  }
}

/** Closes one workspace immediately in UI and schedules backend cleanup asynchronously. */
export async function closeWorkspace(workspaceId: string, options?: { removeBranch?: boolean }): Promise<void> {
  const store = workspaceStore.getState();
  const previousWorkspaces = store.workspaces;
  const workspace = store.workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    return;
  }

  // Folder workspaces are daemon-owned rows, not backend-managed worktrees:
  // closing one must delete the local folder row on the daemon rather than run
  // the workspace close path (which would flip its status to 'closed' and leave
  // a zombie row that resurrects on the next snapshot and blocks re-adding the
  // path). Route the selected-folder close (Cmd+W or menu) through the delete
  // path so the folder + its tabs are removed cleanly.
  if (isFolderWorkspace(workspace)) {
    removeRightPaneStateForWorkspace(workspaceId);
    void deleteLocalFolder(workspaceId).catch((error) => {
      console.error("Failed to delete local folder workspace", error);
      notifyWorkspaceCloseFailure({
        workspaceName: workspace.name,
        error,
      });
    });
    return;
  }

  const projectId = workspace.projectId ?? workspace.repoId;
  const project = projectStore.getState().projects.find((item) => item.id === projectId);

  store.removeWorkspace({
    repoId: projectId,
    workspaceId,
  });

  // Cleanup per-workspace right-pane signals to avoid accumulating stale entries.
  removeRightPaneStateForWorkspace(workspaceId);

  await syncTabStoreWithWorkspace(previousWorkspaces);

  void removeWorkspaceInBackground({
    workspaceId,
    workspaceName: workspace.name,
    organizationId: workspace.organizationId?.trim() || sessionStore.getState().selectedOrganizationId?.trim() || undefined,
    projectId,
    branch: workspace.branch,
    removeBranch: options?.removeBranch,
    postHook: project?.postScript?.trim() || undefined,
  }).catch((error) => {
    console.error("Failed to close backend workspace", error);
    notifyWorkspaceCloseFailure({
      workspaceName: workspace.name,
      error,
    });
  });
}
