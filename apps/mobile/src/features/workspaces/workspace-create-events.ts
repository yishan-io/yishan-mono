import type { WorkspaceFrontendEventsMessage } from "./workspace-frontend-events";

export type WorkspaceCreateFrontendEvent =
  | {
      type: "started";
      workspaceId: string;
      organizationId: string;
      projectId: string;
      workspaceName: string;
      sourceBranch: string;
      branch: string;
      nodeId: string;
    }
  | {
      type: "progress";
      workspaceId: string;
      stepId: string;
      label: string;
      status: "pending" | "running" | "completed" | "failed" | "skipped" | "warning";
      message?: string;
      createdAt: string;
    }
  | {
      type: "completed";
      workspaceId: string;
      worktreePath: string;
    }
  | {
      type: "failed";
      workspaceId: string;
      message: string;
    };

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readWorkspaceCreateFrontendEvent(
  message: WorkspaceFrontendEventsMessage,
): WorkspaceCreateFrontendEvent | null {
  if (message.type !== "event") {
    return null;
  }

  const payload = readRecord(message.payload);
  if (!payload) {
    return null;
  }

  if (message.topic === "workspaceCreateStarted") {
    const workspaceId = readString(payload.workspaceId);
    if (!workspaceId) {
      return null;
    }

    return {
      type: "started",
      workspaceId,
      organizationId: readString(payload.organizationId),
      projectId: readString(payload.projectId),
      workspaceName: readString(payload.workspaceName),
      sourceBranch: readString(payload.sourceBranch),
      branch: readString(payload.branch),
      nodeId: readString(payload.nodeId),
    };
  }

  if (message.topic === "workspaceCreateProgress") {
    const workspaceId = readString(payload.workspaceId);
    const stepId = readString(payload.stepId);
    const label = readString(payload.label);
    const status = readString(payload.status);
    if (!workspaceId || !stepId || !label) {
      return null;
    }

    if (
      status !== "pending" &&
      status !== "running" &&
      status !== "completed" &&
      status !== "failed" &&
      status !== "skipped" &&
      status !== "warning"
    ) {
      return null;
    }

    const messageText = readString(payload.message);
    return {
      type: "progress",
      workspaceId,
      stepId,
      label,
      status,
      message: messageText || undefined,
      createdAt: readString(payload.createdAt),
    };
  }

  if (message.topic === "workspaceCreateCompleted") {
    const workspaceId = readString(payload.workspaceId);
    if (!workspaceId) {
      return null;
    }

    return {
      type: "completed",
      workspaceId,
      worktreePath: readString(payload.worktreePath),
    };
  }

  if (message.topic === "workspaceCreateFailed") {
    const workspaceId = readString(payload.workspaceId);
    if (!workspaceId) {
      return null;
    }

    return {
      type: "failed",
      workspaceId,
      message: readString(payload.message),
    };
  }

  return null;
}
