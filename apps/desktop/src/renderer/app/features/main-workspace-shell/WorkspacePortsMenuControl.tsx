import {
  killTerminalProcess,
  listDetectedPorts,
  subscribeDetectedPorts,
  useTerminalTabLookups,
} from "@renderer/domains/terminal";
import type { TerminalDetectedPort } from "@renderer/domains/terminal";
import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { tabStore } from "@renderer/domains/workbench";
import { enqueueWorkspaceErrorNotice, workspaceStore } from "@renderer/domains/workspace";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInRouterContext } from "react-router-dom";
import { useWorkbenchCommands, useWorkspaceCommands } from "../../../app/commands/useCommands";
import { RouteCloseWatcher } from "../../../hooks/RouteCloseWatcher";
import { PortsTableMenu, type PortsTableMenuRow } from "./PortsTableMenu";

/** Builds one stable row id for port-menu rendering and selection mapping. */
function buildPortRowId(entry: TerminalDetectedPort): string {
  return `${entry.sessionId}\u0000${entry.pid}\u0000${entry.port}\u0000${entry.address}`;
}

/** Renders one workspace-scoped ports badge and dropdown with address, pid, and process columns. */
export function WorkspacePortsMenuControl() {
  const { t } = useTranslation();
  const isInRouterContext = useInRouterContext();
  const selectedWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const tabs = tabStore((state) => state.tabs);
  const { selectTab } = useWorkbenchCommands();
  const { activateWorkspace } = useWorkspaceCommands();
  const [portsMenuAnchorEl, setPortsMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [detectedPorts, setDetectedPorts] = useState<TerminalDetectedPort[]>([]);
  const [isKillingByRowId, setIsKillingByRowId] = useState<Record<string, boolean>>({});
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
        portLabel: String(entry.port),
        portTooltip: String(entry.port),
        pidLabel: String(entry.pid),
        processNameLabel: entry.processName,
      })),
    [workspacePorts],
  );
  const sessionIdByPortRowId = useMemo(() => {
    return new Map(workspacePorts.map((entry) => [buildPortRowId(entry), entry.sessionId]));
  }, [workspacePorts]);
  const pidByPortRowId = useMemo(() => {
    return new Map(workspacePorts.map((entry) => [buildPortRowId(entry), entry.pid]));
  }, [workspacePorts]);
  const terminalTabBySessionId = useTerminalTabLookups();
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

    /** Refreshes one latest terminal port snapshot for workspace badge rendering. */
    const refreshDetectedPorts = async () => {
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
      }
    };

    const unsubscribePortsChanged = subscribeDetectedPorts((ports) => {
      if (!cancelled) {
        setDetectedPorts(ports);
      }
    });

    void refreshDetectedPorts();

    return () => {
      cancelled = true;
      unsubscribePortsChanged();
    };
  }, [closePortsMenu, hasTerminalTabInSelectedWorkspace, selectedWorkspaceId]);

  if (workspacePorts.length === 0) {
    return null;
  }

  return (
    <>
      {isInRouterContext ? <RouteCloseWatcher onClose={closePortsMenu} /> : null}
      <PortsTableMenu
        anchorEl={portsMenuAnchorEl}
        rows={portRows}
        summaryLabel={portsSummaryLabel}
        toggleAriaLabel={t("terminal.ports.toggleLabel", { count: workspacePorts.length })}
        portColumnLabel={"Port"}
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
            activateWorkspace({ workspaceId: targetTab.workspaceId });
            selectTab(targetTab.id);
          }
          closePortsMenu();
        }}
        onCloseRow={(rowId) => {
          const pid = pidByPortRowId.get(rowId);
          if (!pid || isKillingByRowId[rowId]) {
            return;
          }
          setIsKillingByRowId((state) => ({
            ...state,
            [rowId]: true,
          }));
          void killTerminalProcess({ pid })
            .then(async () => {
              const nextPorts = await listDetectedPorts();
              setDetectedPorts(nextPorts);
            })
            .catch((error) => {
              const message = getErrorMessage(error);
              enqueueWorkspaceErrorNotice({
                title: "Failed to close port",
                message: `Could not terminate PID ${pid}: ${message}`,
              });
            })
            .finally(() => {
              setIsKillingByRowId((state) => {
                const next = { ...state };
                delete next[rowId];
                return next;
              });
            });
        }}
        isClosingRow={(rowId) => Boolean(isKillingByRowId[rowId])}
      />
    </>
  );
}
