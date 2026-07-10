import { createContext, useContext } from "react";

export type WorkspaceAgentStatus = "running" | "waiting_input" | "idle";
export type WorkspaceUnreadTone = "success" | "error";
export type WorkspaceIndicator = "running" | "waiting_input" | "done" | "failed" | "none";
export type WorkspaceAggregateIndicator = Exclude<WorkspaceIndicator, "running">;

export type NotificationRuntimeContextValue = {
  terminalAgentStatusByTerminalId: Record<string, WorkspaceAgentStatus>;
  workspaceAgentStatusByWorkspaceId: Record<string, WorkspaceAgentStatus>;
  workspaceUnreadToneByWorkspaceId: Record<string, WorkspaceUnreadTone>;
};

export function resolveWorkspaceIndicator(input: {
  runtimeStatus: WorkspaceAgentStatus;
  unreadTone?: WorkspaceUnreadTone;
}): WorkspaceIndicator {
  if (input.runtimeStatus === "running") {
    return "running";
  }

  if (input.runtimeStatus === "waiting_input") {
    return "waiting_input";
  }

  if (input.unreadTone === "error") {
    return "failed";
  }

  if (input.unreadTone === "success") {
    return "done";
  }

  return "none";
}

/** Resolves one aggregate workspace attention indicator across all workspaces. */
export function resolveAggregateWorkspaceIndicator(input: {
  workspaceAgentStatusByWorkspaceId: Record<string, WorkspaceAgentStatus>;
  workspaceUnreadToneByWorkspaceId: Record<string, WorkspaceUnreadTone>;
}): WorkspaceAggregateIndicator {
  if (Object.values(input.workspaceAgentStatusByWorkspaceId).includes("waiting_input")) {
    return "waiting_input";
  }

  if (Object.values(input.workspaceUnreadToneByWorkspaceId).includes("error")) {
    return "failed";
  }

  if (Object.values(input.workspaceUnreadToneByWorkspaceId).includes("success")) {
    return "done";
  }

  return "none";
}

export const NotificationRuntimeContext = createContext<NotificationRuntimeContextValue | null>(null);

export function useNotificationRuntime(): NotificationRuntimeContextValue {
  const value = useContext(NotificationRuntimeContext);
  if (!value) {
    return {
      terminalAgentStatusByTerminalId: {},
      workspaceAgentStatusByWorkspaceId: {},
      workspaceUnreadToneByWorkspaceId: {},
    };
  }

  return value;
}
