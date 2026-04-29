import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInRouterContext, useLocation } from "react-router-dom";
import type { TerminalDetectedPort } from "../../commands/terminalCommands";
import { PortsTableMenu, type PortsTableMenuRow } from "../../components/PortsTableMenu";
import { useCommands } from "../../hooks/useCommands";
import type { TabStoreState } from "../../store/tabStore";
import { tabStore } from "../../store/tabStore";
import { workspaceStore } from "../../store/workspaceStore";

const PORT_POLL_INTERVAL_MS = 3000;
type TerminalTab = Extract<TabStoreState["tabs"][number], { kind: "terminal" }>;

/** Narrows one tab union entry to a terminal tab with a non-empty bound session id. */
function isTerminalTabWithSessionId(
  tab: TabStoreState["tabs"][number],
): tab is TerminalTab & { data: TerminalTab["data"] & { sessionId: string } } {
  return tab.kind === "terminal" && Boolean(tab.data.sessionId?.trim());
}

/** Builds one stable row id for port-menu rendering and selection mapping. */
function buildPortRowId(entry: TerminalDetectedPort): string {
  return `${entry.sessionId}\u0000${entry.pid}\u0000${entry.port}\u0000${entry.address}`;
}

type PortsMenuRouteCloseWatcherProps = {
  onClose: () => void;
};

/** Closes one open ports dropdown whenever route changes away from workspace root. */
function PortsMenuRouteCloseWatcher({ onClose }: PortsMenuRouteCloseWatcherProps) {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") {
      onClose();
    }
  }, [location.pathname, onClose]);

  return null;
}

/** Renders one workspace-scoped ports badge and dropdown with address, pid, and process columns. */
export function WorkspacePortsMenuControl() {
  const { t } = useTranslation();
  const isInRouterContext = useInRouterContext();
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const tabs = tabStore((state) => state.tabs);
  const { listDetectedPorts, setSelectedTabId, setSelectedWorkspaceId } = useCommands();
  const [portsMenuAnchorEl, setPortsMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [detectedPorts, setDetectedPorts] = useState<TerminalDetectedPort[]>([]);
  const closePortsMenu = useCallback(() => {
    setPortsMenuAnchorEl(null);
  }, []);
  const workspacePorts = useMemo(
    () => detectedPorts.filter((entry) => entry.workspaceId === selectedWorkspaceId),
    [detectedPorts, selectedWorkspaceId],
  );
  const hasTerminalTabInSelectedWorkspace = useMemo(
    () => tabs.some((tab) => tab.workspaceId === selectedWorkspaceId && tab.kind === "terminal"),
    [tabs, selectedWorkspaceId],
  );
  const portRows = useMemo<PortsTableMenuRow[]>(
    () =>
      workspacePorts.map((entry) => ({
        id: buildPortRowId(entry),
        addressPortLabel: `${entry.address}:${entry.port}`,
        addressPortTooltip: `${entry.address}:${entry.port}`,
        pidLabel: String(entry.pid),
        processNameLabel: entry.processName,
      })),
    [workspacePorts],
  );
  const sessionIdByPortRowId = useMemo(() => {
    return new Map(workspacePorts.map((entry) => [buildPortRowId(entry), entry.sessionId]));
  }, [workspacePorts]);
  const terminalTabBySessionId = useMemo(() => {
    return new Map(tabs.filter(isTerminalTabWithSessionId).map((tab) => [tab.data.sessionId.trim(), tab]));
  }, [tabs]);
  const portsSummaryLabel = useMemo(() => {
    if (workspacePorts.length === 0) {
      return "";
    }
    if (workspacePorts.length === 1) {
      return `Port: ${workspacePorts[0]?.port ?? ""}`;
    }
    return t("terminal.ports.summary", {
      count: workspacePorts.length,
    });
  }, [workspacePorts, t]);

  useEffect(() => {
    if (!selectedWorkspaceId || !hasTerminalTabInSelectedWorkspace) {
      setDetectedPorts([]);
      closePortsMenu();
      return;
    }

    let cancelled = false;
    let inFlight = false;

    /** Refreshes one latest terminal port snapshot for workspace badge rendering. */
    const refreshDetectedPorts = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const nextPorts = await listDetectedPorts();
        if (!cancelled) {
          setDetectedPorts(nextPorts);
        }
      } catch (error) {
        if (!cancelled) {
          setDetectedPorts([]);
        }
        console.error("[WorkspacePortsMenuControl] Failed to load detected ports", error);
      } finally {
        inFlight = false;
      }
    };

    void refreshDetectedPorts();
    const intervalId = window.setInterval(() => {
      void refreshDetectedPorts();
    }, PORT_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [closePortsMenu, hasTerminalTabInSelectedWorkspace, listDetectedPorts, selectedWorkspaceId]);

  if (workspacePorts.length === 0) {
    return null;
  }

  return (
    <>
      {isInRouterContext ? <PortsMenuRouteCloseWatcher onClose={closePortsMenu} /> : null}
      <PortsTableMenu
        anchorEl={portsMenuAnchorEl}
        rows={portRows}
        summaryLabel={portsSummaryLabel}
        toggleAriaLabel={t("terminal.ports.toggleLabel", { count: workspacePorts.length })}
        addressPortColumnLabel={t("terminal.ports.columns.addressPort")}
        pidColumnLabel={t("terminal.ports.columns.pid")}
        processNameColumnLabel={t("terminal.ports.columns.processName")}
        onOpen={setPortsMenuAnchorEl}
        onClose={closePortsMenu}
        onSelectRow={(rowId) => {
          const sessionId = sessionIdByPortRowId.get(rowId);
          if (!sessionId) {
            closePortsMenu();
            return;
          }
          const targetTab = terminalTabBySessionId.get(sessionId);
          if (targetTab) {
            setSelectedWorkspaceId(targetTab.workspaceId);
            setSelectedTabId(targetTab.id);
          }
          closePortsMenu();
        }}
      />
    </>
  );
}
