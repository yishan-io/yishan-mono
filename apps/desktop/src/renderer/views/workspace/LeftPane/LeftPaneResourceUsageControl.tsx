import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInRouterContext, useLocation } from "react-router-dom";
import type { TerminalResourceUsageSnapshot } from "../../../rpc/daemonTypes";
import {
  WorkspaceResourceTableMenu,
  type WorkspaceResourceTableMenuRow,
} from "../../../components/WorkspaceResourceTableMenu";
import { useCommands } from "../../../hooks/useCommands";
import { useSharedTerminalResourceUsageSnapshot } from "../../../hooks/useSharedTerminalResourceUsageSnapshot";
import type { TabStoreState } from "../../../store/tabStore";
import { tabStore } from "../../../store/tabStore";
import { workspaceStore } from "../../../store/workspaceStore";

type TerminalTab = Extract<TabStoreState["tabs"][number], { kind: "terminal" }>;

type WorkspaceResourceUsageRow = {
  workspaceId: string;
  repoId: string;
  repoName: string;
  workspaceName: string;
  cpuPercent: number;
  memoryBytes: number;
};

type LeftPaneResourceUsageRouteCloseWatcherProps = {
  onClose: () => void;
};

/** Closes one open left-pane resource dropdown whenever route changes away from workspace root. */
function LeftPaneResourceUsageRouteCloseWatcher({ onClose }: LeftPaneResourceUsageRouteCloseWatcherProps) {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/") {
      onClose();
    }
  }, [location.pathname, onClose]);

  return null;
}

/** Formats one CPU percentage for compact metrics display. */
function formatCpuPercent(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

/** Formats one byte value to one concise MB/GB memory label. */
function formatMemoryBytes(value: number): string {
  const safeValue = Math.max(0, value);
  const gb = safeValue / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = safeValue / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/** Narrows one tab union entry to a terminal tab with a non-empty bound session id. */
function isTerminalTabWithSessionId(
  tab: TabStoreState["tabs"][number],
): tab is TerminalTab & { data: TerminalTab["data"] & { sessionId: string } } {
  return tab.kind === "terminal" && Boolean(tab.data.sessionId?.trim());
}

/** Aggregates one per-process snapshot into per-workspace CPU/memory rows. */
function buildWorkspaceRows(
  snapshot: TerminalResourceUsageSnapshot | null,
  repoNameById: Map<string, string>,
  workspaceNameById: Map<string, string>,
  workspaceRepoIdById: Map<string, string>,
): WorkspaceResourceUsageRow[] {
  if (!snapshot) {
    return [];
  }

  const usageByWorkspaceId = new Map<string, WorkspaceResourceUsageRow>();
  for (const process of snapshot.processes) {
    const workspaceId = process.workspaceId?.trim();
    if (!workspaceId) {
      continue;
    }
    const repoId = workspaceRepoIdById.get(workspaceId);
    if (!repoId) {
      continue;
    }
    const repoName = repoNameById.get(repoId) ?? repoId;
    const workspaceName = workspaceNameById.get(workspaceId) ?? workspaceId;
    const existing = usageByWorkspaceId.get(workspaceId);
    if (existing) {
      existing.cpuPercent += process.cpuPercent;
      existing.memoryBytes += process.memoryBytes;
      continue;
    }
    usageByWorkspaceId.set(workspaceId, {
      workspaceId,
      repoId,
      repoName,
      workspaceName,
      cpuPercent: process.cpuPercent,
      memoryBytes: process.memoryBytes,
    });
  }

  return [...usageByWorkspaceId.values()].sort((left, right) => {
    if (left.memoryBytes !== right.memoryBytes) {
      return right.memoryBytes - left.memoryBytes;
    }
    if (left.cpuPercent !== right.cpuPercent) {
      return right.cpuPercent - left.cpuPercent;
    }
    return left.workspaceName.localeCompare(right.workspaceName);
  });
}

/** Renders one left-pane memory summary with dropdown workspace CPU/memory rows. */
export function LeftPaneResourceUsageControl() {
  const { t } = useTranslation();
  const isInRouterContext = useInRouterContext();
  const projects = workspaceStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
  const tabs = tabStore((state) => state.tabs);
  const { getTerminalResourceUsage, setSelectedRepoId, setSelectedWorkspaceId } = useCommands();
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const isMenuOpen = Boolean(menuAnchorEl);

  const repoNameById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);
  const workspaceNameById = useMemo(() => {
    return new Map(workspaces.map((workspace) => [workspace.id, workspace.title]));
  }, [workspaces]);
  const workspaceRepoIdById = useMemo(() => {
    return new Map(workspaces.map((workspace) => [workspace.id, workspace.repoId]));
  }, [workspaces]);
  const hasTerminalSession = useMemo(() => tabs.some(isTerminalTabWithSessionId), [tabs]);
  const shouldPollResourceUsage = workspaces.length > 0 && hasTerminalSession;
  const snapshot = useSharedTerminalResourceUsageSnapshot({
    enabled: shouldPollResourceUsage,
    interactive: isMenuOpen,
    fetchSnapshot: getTerminalResourceUsage,
  });
  const rows = useMemo(
    () => buildWorkspaceRows(snapshot, repoNameById, workspaceNameById, workspaceRepoIdById),
    [repoNameById, snapshot, workspaceNameById, workspaceRepoIdById],
  );
  const tableRows = useMemo<WorkspaceResourceTableMenuRow[]>(
    () =>
      rows.map((row) => ({
        id: row.workspaceId,
        repoLabel: row.repoName,
        workspaceLabel: row.workspaceName,
        cpuLabel: formatCpuPercent(row.cpuPercent),
        memoryLabel: formatMemoryBytes(row.memoryBytes),
      })),
    [rows],
  );
  const totalMemoryBytes = useMemo(() => rows.reduce((sum, row) => sum + row.memoryBytes, 0), [rows]);
  const summaryLabel = useMemo(
    () =>
      t("terminal.resourceUsage.leftPaneSummary", {
        memory: formatMemoryBytes(totalMemoryBytes),
      }),
    [t, totalMemoryBytes],
  );

  const closeMenu = useCallback(() => {
    setMenuAnchorEl(null);
  }, []);

  useEffect(() => {
    if (!shouldPollResourceUsage) {
      closeMenu();
    }
  }, [closeMenu, shouldPollResourceUsage]);

  if (!shouldPollResourceUsage) {
    return null;
  }

  return (
    <>
      {isInRouterContext ? <LeftPaneResourceUsageRouteCloseWatcher onClose={closeMenu} /> : null}
      <WorkspaceResourceTableMenu
        anchorEl={menuAnchorEl}
        rows={tableRows}
        summaryLabel={summaryLabel}
        toggleAriaLabel={t("terminal.resourceUsage.toggleLabel")}
        repoColumnLabel={t("terminal.resourceUsage.columns.repo")}
        workspaceColumnLabel={t("workspace.column")}
        cpuColumnLabel={t("terminal.resourceUsage.columns.cpu")}
        memoryColumnLabel={t("terminal.resourceUsage.columns.memory")}
        emptyLabel={t("terminal.resourceUsage.empty")}
        onOpen={setMenuAnchorEl}
        onClose={closeMenu}
        onSelectRow={(workspaceId) => {
          const repoId = workspaceRepoIdById.get(workspaceId);
          if (!repoId) {
            closeMenu();
            return;
          }
          setSelectedRepoId(repoId);
          setSelectedWorkspaceId(workspaceId);
          closeMenu();
        }}
      />
    </>
  );
}
