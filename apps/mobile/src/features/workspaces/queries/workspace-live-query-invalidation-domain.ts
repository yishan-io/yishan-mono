import type { WorkspaceFrontendEventsMessage } from "@/features/workspaces/workspace-frontend-events";

type WorkspaceLiveQueryScope = {
  organizationId: string;
  projectId: string;
  workspaceId: string;
};

type WorkspaceFilesChangedEvent = {
  changedRelativePaths: string[];
  workspaceId: string;
};

type WorkspaceSnapshotChangedEvent = {
  change: string;
  organizationId: string;
  projectId: string;
  resource: string;
  workspaceId: string;
};

export type WorkspaceLiveQueryInvalidationPlan = {
  change?: string;
  changedRelativePaths?: string[];
  invalidateProjectLists: boolean;
  invalidateWorkspaceLists: boolean;
  invalidateWorkspaceReadQueries: boolean;
  resource?: string;
  topic: "workspaceFilesChanged" | "workspaceSnapshotChanged";
};

function readWorkspaceFilesChangedEvent(message: WorkspaceFrontendEventsMessage): WorkspaceFilesChangedEvent | null {
  if (message.type !== "event" || message.topic !== "workspaceFilesChanged") {
    return null;
  }

  const workspaceId = typeof message.payload.workspaceId === "string" ? message.payload.workspaceId.trim() : "";
  if (!workspaceId) {
    return null;
  }

  const changedRelativePaths = Array.isArray(message.payload.changedRelativePaths)
    ? message.payload.changedRelativePaths.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];

  return {
    changedRelativePaths,
    workspaceId,
  };
}

function readWorkspaceSnapshotChangedEvent(
  message: WorkspaceFrontendEventsMessage,
): WorkspaceSnapshotChangedEvent | null {
  if (message.type !== "event" || message.topic !== "workspaceSnapshotChanged") {
    return null;
  }

  const organizationId =
    typeof message.payload.organizationId === "string" ? message.payload.organizationId.trim() : "";
  const resource = typeof message.payload.resource === "string" ? message.payload.resource.trim() : "";
  if (!organizationId || !resource) {
    return null;
  }

  return {
    change: typeof message.payload.change === "string" ? message.payload.change.trim() : "",
    organizationId,
    projectId: typeof message.payload.projectId === "string" ? message.payload.projectId.trim() : "",
    resource,
    workspaceId: typeof message.payload.workspaceId === "string" ? message.payload.workspaceId.trim() : "",
  };
}

export function buildWorkspaceLiveQueryInvalidationPlan(input: {
  message: WorkspaceFrontendEventsMessage;
  scope: WorkspaceLiveQueryScope;
}): WorkspaceLiveQueryInvalidationPlan | null {
  const filesChangedEvent = readWorkspaceFilesChangedEvent(input.message);
  if (filesChangedEvent) {
    if (filesChangedEvent.workspaceId !== input.scope.workspaceId) {
      return null;
    }

    return {
      changedRelativePaths: filesChangedEvent.changedRelativePaths,
      invalidateProjectLists: false,
      invalidateWorkspaceLists: false,
      invalidateWorkspaceReadQueries: true,
      topic: "workspaceFilesChanged",
    };
  }

  const snapshotChangedEvent = readWorkspaceSnapshotChangedEvent(input.message);
  if (!snapshotChangedEvent || snapshotChangedEvent.organizationId !== input.scope.organizationId) {
    return null;
  }

  if (snapshotChangedEvent.projectId && snapshotChangedEvent.projectId !== input.scope.projectId) {
    return null;
  }

  if (snapshotChangedEvent.resource === "project") {
    return {
      change: snapshotChangedEvent.change,
      invalidateProjectLists: true,
      invalidateWorkspaceLists: true,
      invalidateWorkspaceReadQueries: false,
      resource: snapshotChangedEvent.resource,
      topic: "workspaceSnapshotChanged",
    };
  }

  if (snapshotChangedEvent.resource !== "workspace") {
    return null;
  }

  return {
    change: snapshotChangedEvent.change,
    invalidateProjectLists: true,
    invalidateWorkspaceLists: true,
    invalidateWorkspaceReadQueries: snapshotChangedEvent.workspaceId === input.scope.workspaceId,
    resource: snapshotChangedEvent.resource,
    topic: "workspaceSnapshotChanged",
  };
}

export function isWorkspaceReadQueryKey(queryKey: readonly unknown[], scope: WorkspaceLiveQueryScope): boolean {
  return (
    queryKey[0] === "organizations" &&
    queryKey[1] === scope.organizationId &&
    queryKey[2] === "projects" &&
    queryKey[3] === scope.projectId &&
    queryKey[4] === "workspaces" &&
    queryKey[5] === scope.workspaceId &&
    (queryKey[6] === "files" ||
      queryKey[6] === "file" ||
      queryKey[6] === "diff" ||
      queryKey[6] === "changes" ||
      queryKey[6] === "git")
  );
}
