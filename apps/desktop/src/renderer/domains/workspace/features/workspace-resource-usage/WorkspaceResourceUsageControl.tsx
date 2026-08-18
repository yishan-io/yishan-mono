import {
  getTerminalResourceUsage,
  useSharedTerminalResourceUsageSnapshot,
  useTerminalTabLookups,
} from "@renderer/domains/terminal";
import { activateWorkspace, setSelectedTab as selectTab, workbenchNavigationStore } from "@renderer/domains/workbench";
import { tabStore } from "@renderer/domains/workbench";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInRouterContext } from "react-router-dom";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { formatCpuPercent, formatMemoryBytes } from "../../../../helpers/formatters";
import { isTerminalTabWithSessionId } from "../../../../helpers/terminalTabUtils";
import { ResourceUsageMenu, type ResourceUsageMenuRow } from "./ResourceUsageMenu";
import { RouteCloseWatcher } from "../../../../hooks/RouteCloseWatcher";

const MAX_VISIBLE_PROCESSES = 20;

/** Builds one stable row id for resource menu rendering. */
function buildResourceUsageRowId(sessionId: string, pid: number): string {
  return `${sessionId}\u0000${pid}`;
}

/** Renders one workspace-scoped CPU/memory summary and subprocess usage dropdown. */
export function WorkspaceResourceUsageControl() {
  const { t } = useTranslation();
  const isInRouterContext = useInRouterContext();
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const tabs = tabStore((state) => state.tabs);
  const [resourceMenuAnchorEl, setResourceMenuAnchorEl] = useState<null | HTMLElement>(null);
  const closeResourceMenu = useCallback(() => {
    setResourceMenuAnchorEl(null);
  }, []);
  const isResourceMenuOpen = Boolean(resourceMenuAnchorEl);

  const hasTerminalTabInSelectedWorkspace = useMemo(
    () => tabs.some((tab) => tab.workspaceId === selectedWorkspaceId && isTerminalTabWithSessionId(tab)),
    [tabs, selectedWorkspaceId],
  );
  const shouldPollResourceUsage = Boolean(selectedWorkspaceId && hasTerminalTabInSelectedWorkspace);
  const snapshot = useSharedTerminalResourceUsageSnapshot({
    enabled: shouldPollResourceUsage,
    interactive: isResourceMenuOpen,
    fetchSnapshot: getTerminalResourceUsage,
  });

  useEffect(() => {
    if (!shouldPollResourceUsage) {
      closeResourceMenu();
    }
  }, [closeResourceMenu, shouldPollResourceUsage]);

  const workspaceProcesses = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.processes
      .filter((process) => process.workspaceId === selectedWorkspaceId)
      .sort((left, right) => {
        if (left.cpuPercent !== right.cpuPercent) {
          return right.cpuPercent - left.cpuPercent;
        }
        if (left.memoryBytes !== right.memoryBytes) {
          return right.memoryBytes - left.memoryBytes;
        }
        return left.pid - right.pid;
      });
  }, [selectedWorkspaceId, snapshot]);

  const totalCpuPercent = useMemo(
    () => workspaceProcesses.reduce((sum, process) => sum + process.cpuPercent, 0),
    [workspaceProcesses],
  );
  const totalMemoryBytes = useMemo(
    () => workspaceProcesses.reduce((sum, process) => sum + process.memoryBytes, 0),
    [workspaceProcesses],
  );

  const rows = useMemo<ResourceUsageMenuRow[]>(
    () =>
      workspaceProcesses.slice(0, MAX_VISIBLE_PROCESSES).map((process) => ({
        id: buildResourceUsageRowId(process.sessionId, process.pid),
        processNameLabel: process.processName,
        pidLabel: String(process.pid),
        cpuLabel: formatCpuPercent(process.cpuPercent),
        memoryLabel: formatMemoryBytes(process.memoryBytes),
      })),
    [workspaceProcesses],
  );
  const sessionIdByRowId = useMemo(() => {
    const mapping = new Map<string, string>();
    for (const process of workspaceProcesses.slice(0, MAX_VISIBLE_PROCESSES)) {
      mapping.set(buildResourceUsageRowId(process.sessionId, process.pid), process.sessionId);
    }
    return mapping;
  }, [workspaceProcesses]);
  const terminalTabBySessionId = useTerminalTabLookups();

  const summaryLabel = useMemo(() => {
    return t("terminal.resourceUsage.summary", {
      cpu: formatCpuPercent(totalCpuPercent),
      memory: formatMemoryBytes(totalMemoryBytes),
    });
  }, [t, totalCpuPercent, totalMemoryBytes]);

  if (!selectedWorkspaceId || !hasTerminalTabInSelectedWorkspace) {
    return null;
  }

  return (
    <>
      {isInRouterContext ? <RouteCloseWatcher onClose={closeResourceMenu} /> : null}
      <ResourceUsageMenu
        anchorEl={resourceMenuAnchorEl}
        rows={rows}
        summaryLabel={summaryLabel}
        toggleAriaLabel={t("terminal.resourceUsage.toggleLabel")}
        processColumnLabel={t("terminal.resourceUsage.columns.process")}
        pidColumnLabel={t("terminal.resourceUsage.columns.pid")}
        cpuColumnLabel={t("terminal.resourceUsage.columns.cpu")}
        memoryColumnLabel={t("terminal.resourceUsage.columns.memory")}
        emptyLabel={t("terminal.resourceUsage.empty")}
        onOpen={setResourceMenuAnchorEl}
        onClose={closeResourceMenu}
        onSelectRow={(rowId) => {
          const sessionId = sessionIdByRowId.get(rowId);
          if (!sessionId) {
            closeResourceMenu();
            return;
          }
          const targetTab = terminalTabBySessionId.get(sessionId);
          if (targetTab) {
            activateWorkspace({ workspaceId: targetTab.workspaceId });
            selectTab(targetTab.id);
          }
          closeResourceMenu();
        }}
      />
    </>
  );
}
