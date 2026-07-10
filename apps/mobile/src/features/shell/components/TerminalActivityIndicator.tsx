import { useNotificationRuntime } from "@/features/notifications/notification-runtime-context";

import type { TerminalStatus } from "../state/shell.types";
import { CliSpinnerText } from "./CliSpinnerText";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

type TerminalActivityIndicatorProps = {
  status?: TerminalStatus;
  terminalId: string;
};

function resolveTerminalActivityStatus(status: TerminalStatus | undefined): TerminalStatus | undefined {
  if (status === "error" || status === "waiting_input" || status === "initializing") {
    return status;
  }

  return undefined;
}

export function TerminalActivityIndicator({ status, terminalId }: TerminalActivityIndicatorProps) {
  const { terminalAgentStatusByTerminalId } = useNotificationRuntime();
  const activityStatus = resolveTerminalActivityStatus(status);

  if (activityStatus) {
    return <SessionStatusIndicator showSpinnerForActive status={activityStatus} />;
  }

  if (terminalAgentStatusByTerminalId[terminalId] === "running") {
    return <CliSpinnerText fontSize={14} />;
  }

  if (terminalAgentStatusByTerminalId[terminalId] === "waiting_input") {
    return <SessionStatusIndicator status="waiting_input" />;
  }

  return null;
}
