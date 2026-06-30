import { StatusDot } from "@/components/ui/StatusDot";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import {
  resolveWorkspaceIndicator,
  useNotificationRuntime,
} from "@/features/notifications/notification-runtime-context";
import { CliSpinnerText } from "./CliSpinnerText";

type RuntimeStatusIndicatorProps = {
  workspaceId: string;
};

export function RuntimeStatusIndicator({ workspaceId }: RuntimeStatusIndicatorProps) {
  const { workspaceAgentStatusByWorkspaceId, workspaceUnreadToneByWorkspaceId } = useNotificationRuntime();
  const indicator = resolveWorkspaceIndicator({
    runtimeStatus: workspaceAgentStatusByWorkspaceId[workspaceId] ?? "idle",
    unreadTone: workspaceUnreadToneByWorkspaceId[workspaceId],
  });

  if (indicator === "running") {
    return <CliSpinnerText fontSize={14} />;
  }

  if (indicator === "waiting_input") {
    return <StatusDot color={MOBILE_UI_TOKENS.status.warning} />;
  }

  if (indicator === "failed") {
    return <StatusDot color={MOBILE_UI_TOKENS.status.error} />;
  }

  if (indicator === "done") {
    return <StatusDot color={MOBILE_UI_TOKENS.status.success} />;
  }

  return null;
}
