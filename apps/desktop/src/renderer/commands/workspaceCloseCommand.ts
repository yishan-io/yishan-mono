import { getDaemonClient } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";
import type { WorkspaceStoreState } from "../store/types";
import { enqueueWorkspaceErrorNotice } from "../store/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../store/workspaceStore";
import { notifyLifecycleScriptWarnings } from "./workspaceCreateCommand";
import { syncTabStoreWithWorkspace } from "./workspaceTabSync";

type CloseWorkspaceResponse = {
  workspace: { id: string; status: string };
  workspaceId: string;
  lifecycleScriptWarnings: import("../store/workspaceLifecycleNoticeStore").WorkspaceLifecycleScriptWarning[];
  terminalCleanupErrors?: string[];
};

type WorkspaceStoreFacade = typeof workspaceStore & {
  getState?: () => WorkspaceStoreState;
};

/** Reads workspace store state for both real Zustand stores and selector-only test doubles. */
function readWorkspaceStoreState(): WorkspaceStoreState {
  const facade = workspaceStore as WorkspaceStoreFacade;
  if (typeof facade.getState === "function") {
    return facade.getState();
  }

  return (
    workspaceStore as unknown as (selector: (state: WorkspaceStoreState) => WorkspaceStoreState) => WorkspaceStoreState
  )((state) => state);
}

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
  const client = await getDaemonClient();

  const closed = (await client.workspace.close({
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
  const store = readWorkspaceStoreState();
  const previousWorkspaces = store.workspaces;
  const workspace = store.workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    return;
  }

  const projectId = workspace.projectId ?? workspace.repoId;
  const project = store.projects.find((item) => item.id === projectId);

  store.removeWorkspace({
    repoId: projectId,
    workspaceId,
  });
  syncTabStoreWithWorkspace(previousWorkspaces);

  void removeWorkspaceInBackground({
    workspaceId,
    workspaceName: workspace.name,
    organizationId:
      workspace.organizationId?.trim() || sessionStore.getState().selectedOrganizationId?.trim() || undefined,
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
