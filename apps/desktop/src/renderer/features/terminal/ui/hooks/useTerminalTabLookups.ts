import { useMemo } from "react";
import type { WorkspaceTab } from "../../../../features/workbench";
import { useWorkspaceTabs } from "../../../../features/workbench/ui/hooks/useWorkbenchTabs";
import { isTerminalTabWithSessionId } from "../../../../helpers/terminalTabUtils";

type TerminalTab = Extract<WorkspaceTab, { kind: "terminal" }>;
type TerminalTabWithSessionId = TerminalTab & { data: TerminalTab["data"] & { sessionId: string } };

/**
 * Returns a stable `Map<sessionId, tab>` over all terminal tabs that have a
 * non-empty session ID. Re-derived only when the tabs array reference changes.
 */
export function useTerminalTabLookups(): Map<string, TerminalTabWithSessionId> {
  const tabs = useWorkspaceTabs();

  return useMemo(
    () => new Map(tabs.filter(isTerminalTabWithSessionId).map((tab) => [tab.data.sessionId.trim(), tab])),
    [tabs],
  );
}
