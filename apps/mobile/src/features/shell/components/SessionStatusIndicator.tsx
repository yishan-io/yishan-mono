import { StatusDot } from "@/components/ui/StatusDot";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { TerminalItem } from "@/features/shell/state/shell.types";
import { CliSpinnerText } from "./CliSpinnerText";

type SessionStatusIndicatorProps = {
  showSpinnerForActive?: boolean;
  status?: TerminalItem["status"];
};

export function SessionStatusIndicator({ showSpinnerForActive = false, status }: SessionStatusIndicatorProps) {
  if (status === "initializing") {
    if (showSpinnerForActive) {
      return <CliSpinnerText fontSize={14} />;
    }

    return <StatusDot color={MOBILE_UI_TOKENS.status.warning} />;
  }

  if (status === "waiting_input") {
    return <StatusDot color={MOBILE_UI_TOKENS.status.warning} />;
  }

  if (status === "error") {
    return <StatusDot color={MOBILE_UI_TOKENS.status.error} />;
  }

  return null;
}
