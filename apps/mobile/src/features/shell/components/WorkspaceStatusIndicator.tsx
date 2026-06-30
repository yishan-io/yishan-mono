import {
  resolveWorkspaceIndicator,
  useNotificationRuntime,
} from "@/features/notifications/notification-runtime-context";
import type { TerminalItem } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { WorkspaceStatusIcon } from "./WorkspaceStatusIcon";

type WorkspaceStatusIndicatorProps = {
  runningMode?: "icon" | "spinner";
  terminalStatus?: TerminalItem["status"];
  workspaceId: string;
  workspaceKind: Workspace["kind"];
  size?: number;
  width?: number;
};

export function WorkspaceStatusIndicator({
  runningMode,
  terminalStatus,
  workspaceId,
  workspaceKind,
  size,
  width,
}: WorkspaceStatusIndicatorProps) {
  const { workspaceAgentStatusByWorkspaceId, workspaceUnreadToneByWorkspaceId } = useNotificationRuntime();
  const indicator =
    resolveTerminalIndicator(terminalStatus) ??
    resolveWorkspaceIndicator({
      runtimeStatus: workspaceAgentStatusByWorkspaceId[workspaceId] ?? "idle",
      unreadTone: workspaceUnreadToneByWorkspaceId[workspaceId],
    });

  return (
    <WorkspaceStatusIcon
      indicator={indicator}
      kind={workspaceKind}
      runningMode={runningMode}
      size={size}
      width={width}
    />
  );
}

function resolveTerminalIndicator(status?: TerminalItem["status"]) {
  if (status === "initializing" || status === "running") {
    return "running";
  }

  if (status === "waiting_input") {
    return "waiting_input";
  }

  return null;
}
