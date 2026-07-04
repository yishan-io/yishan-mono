import type { WorkspaceCreateFrontendEvent } from "@/features/workspaces/workspace-create-events";
import type { Workspace } from "@/features/workspaces/workspaces.types";

export type WaitForCreatedWorkspaceInput = {
  delayMs?: number;
  loadWorkspaces: () => Promise<Workspace[]>;
  maxAttempts?: number;
  workspaceId: string;
};

export type PendingWorkspaceCreate = {
  branch: string;
  nodeId: string;
  requestedWorkspaceId: string;
  sourceBranch: string;
  workspaceId: string;
  workspaceName: string;
};

export type ActiveWorkspaceCreate = PendingWorkspaceCreate & {
  organizationId: string;
  projectId: string;
};

function delay(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForCreatedWorkspace(input: WaitForCreatedWorkspaceInput): Promise<Workspace> {
  const maxAttempts = input.maxAttempts ?? 5;
  const delayMs = input.delayMs ?? 3_000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const workspaces = await input.loadWorkspaces();
    const createdWorkspace = workspaces.find((workspace) => workspace.id === input.workspaceId);
    if (createdWorkspace) {
      return createdWorkspace;
    }

    if (attempt < maxAttempts - 1) {
      await delay(delayMs);
    }
  }

  throw new Error("Workspace was created, but mobile could not refresh it yet.");
}

function matchesWorkspaceCreateStartedEvent(input: {
  currentCreate: PendingWorkspaceCreate;
  event: Extract<WorkspaceCreateFrontendEvent, { type: "started" }>;
}): boolean {
  const { currentCreate, event } = input;
  return (
    event.nodeId === currentCreate.nodeId &&
    event.branch === currentCreate.branch &&
    event.sourceBranch === currentCreate.sourceBranch &&
    event.workspaceName === currentCreate.workspaceName
  );
}

export function shouldHandleWorkspaceCreateEvent(input: {
  currentCreate: PendingWorkspaceCreate;
  event: WorkspaceCreateFrontendEvent;
}): boolean {
  const { currentCreate, event } = input;
  if (event.workspaceId === currentCreate.workspaceId || event.workspaceId === currentCreate.requestedWorkspaceId) {
    return true;
  }

  if (event.type !== "started") {
    return false;
  }

  return matchesWorkspaceCreateStartedEvent({ currentCreate, event });
}

export function syncPendingWorkspaceCreateId<T extends PendingWorkspaceCreate>(input: {
  currentCreate: T;
  workspaceId: string;
}): T {
  const normalizedWorkspaceId = input.workspaceId.trim();
  if (!normalizedWorkspaceId || normalizedWorkspaceId === input.currentCreate.workspaceId) {
    return input.currentCreate;
  }

  return {
    ...input.currentCreate,
    workspaceId: normalizedWorkspaceId,
  } as T;
}
