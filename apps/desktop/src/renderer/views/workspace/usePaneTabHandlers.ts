import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SplitDropRegion } from "../../components/SplitDropZone";
import { resolveDropResult } from "../../components/SplitDropZone";
import type { TabBarCreateOption } from "../../components/TabBar";
import type { DesktopAgentKind } from "../../helpers/agentSettings";
import { AGENT_SETTINGS_LABEL_KEY_BY_KIND, resolveAgentLaunchCommand } from "../../helpers/agentSettings";
import type { Commands } from "../../hooks/useCommands";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { splitPaneStore } from "../../store/splitPaneStore";
import type { WorkspaceTab } from "../../store/types";
import { forceFitTerminalRuntimes } from "./terminal/terminalRuntimeRegistry";

export type UsePaneTabHandlersOptions = {
  workspaceId: string;
  workspaceTabs: WorkspaceTab[];
  workspace: { worktreePath?: string } | undefined;
  enabledAgentKindSet: Set<DesktopAgentKind>;
  cmd: Commands;
  setFocusContentRequestKey: React.Dispatch<React.SetStateAction<number>>;
  setIsDraggingSplit: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Returns all tab and pane event handlers for a single workspace split-pane view.
 */
export function usePaneTabHandlers({
  workspaceId,
  workspaceTabs,
  workspace,
  enabledAgentKindSet,
  cmd,
  setFocusContentRequestKey,
  setIsDraggingSplit,
}: UsePaneTabHandlersOptions) {
  const { t } = useTranslation();
  const customCommandByAgentKind = agentSettingsStore((state) => state.customCommandByAgentKind);
  const terminalTabIds = useMemo(
    () => workspaceTabs.filter((tab) => tab.kind === "terminal").map((tab) => tab.id),
    [workspaceTabs],
  );

  useEffect(() => {
    if (terminalTabIds.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      forceFitTerminalRuntimes(terminalTabIds);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [terminalTabIds]);

  const handleSelectTab = useCallback(
    (paneId: string, tabId: string) => {
      splitPaneStore.getState().selectTab(workspaceId, paneId, tabId);
      cmd.selectTab(tabId);
    },
    [workspaceId, cmd],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      splitPaneStore.getState().unregisterTabFromPane(workspaceId, tabId);
      cmd.closeTab(tabId);
    },
    [workspaceId, cmd],
  );

  const handleCreateTab = useCallback(
    (option: TabBarCreateOption) => {
      if (option === "terminal") {
        cmd.openTab({ workspaceId, kind: "terminal", title: t("terminal.title"), reuseExisting: false });
        return;
      }
      if (option === "browser") {
        cmd.openTab({ workspaceId, kind: "browser", url: "" });
        return;
      }
      if (!enabledAgentKindSet.has(option)) return;
      const title = t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[option]);
      const launchCommand = resolveAgentLaunchCommand(option, customCommandByAgentKind);
      cmd.openTab({
        workspaceId,
        kind: "terminal",
        title,
        launchCommand,
        agentKind: option,
        reuseExisting: false,
      });
    },
    [cmd, workspaceId, enabledAgentKindSet, customCommandByAgentKind, t],
  );

  const handleRenameTab = useCallback(
    async (tabId: string, title: string) => {
      const tab = workspaceTabs.find((item) => item.id === tabId);
      if (!tab) return;

      if (tab.kind !== "file") {
        cmd.renameTab(tabId, title, { userRenamed: true });
        return;
      }

      const workspaceWorktreePath = workspace?.worktreePath;
      if (!workspaceWorktreePath) return;

      const pathSegments = tab.data.path.split("/").filter(Boolean);
      const parentPath = pathSegments.slice(0, -1).join("/");
      const targetPath = parentPath ? `${parentPath}/${title}` : title;
      if (targetPath === tab.data.path) return;

      try {
        await cmd.renameEntry({ workspaceId, fromRelativePath: tab.data.path, toRelativePath: targetPath });
        cmd.renameTabsForEntryRename(workspaceId, tab.data.path, targetPath);
      } catch (error) {
        console.error("Failed to rename workspace file from tab", error);
      }
    },
    [cmd, workspaceTabs, workspace, workspaceId],
  );

  const handleReorderTab = useCallback(
    (paneId: string, draggedTabId: string, targetTabId: string, position: "before" | "after") => {
      splitPaneStore.getState().reorderTab(workspaceId, paneId, draggedTabId, targetTabId, position);
    },
    [workspaceId],
  );

  const handleSplitDrop = useCallback(
    (tabId: string, targetPaneId: string, region: SplitDropRegion) => {
      const result = resolveDropResult(region);
      if (!result) return;

      if ("center" in result) {
        splitPaneStore.getState().moveTab(workspaceId, tabId, targetPaneId);
      } else {
        splitPaneStore.getState().splitPane(workspaceId, {
          tabId,
          targetPaneId,
          direction: result.direction,
          placement: result.placement,
        });
      }

      cmd.selectTab(tabId);
      setFocusContentRequestKey((key) => key + 1);
      setIsDraggingSplit(false);
    },
    [workspaceId, cmd, setFocusContentRequestKey, setIsDraggingSplit],
  );

  const handleFocusPane = useCallback(
    (paneId: string) => {
      splitPaneStore.getState().setActivePane(workspaceId, paneId);
      const pane = splitPaneStore.getState().getPane(workspaceId, paneId);
      if (pane?.selectedTabId) {
        cmd.selectTab(pane.selectedTabId);
      }
    },
    [workspaceId, cmd],
  );

  const performSplit = useCallback(
    (paneId: string, direction: "horizontal" | "vertical") => {
      const pane = splitPaneStore.getState().getPane(workspaceId, paneId);
      if (!pane?.selectedTabId || pane.tabIds.length <= 1) return;
      const movedTabId = pane.selectedTabId;
      splitPaneStore.getState().splitPane(workspaceId, {
        tabId: movedTabId,
        targetPaneId: paneId,
        direction,
        placement: "second",
      });
      cmd.selectTab(movedTabId);
      setFocusContentRequestKey((key) => key + 1);
    },
    [workspaceId, cmd, setFocusContentRequestKey],
  );

  const handleSplitRight = useCallback((paneId: string) => performSplit(paneId, "horizontal"), [performSplit]);

  const handleSplitDown = useCallback((paneId: string) => performSplit(paneId, "vertical"), [performSplit]);

  const handleTabDragStart = useCallback(() => setIsDraggingSplit(true), [setIsDraggingSplit]);
  const handleTabDragEnd = useCallback(() => setIsDraggingSplit(false), [setIsDraggingSplit]);

  const handleSplitRatioChange = useCallback(
    (branchId: string, ratio: number) => {
      splitPaneStore.getState().updateSplitRatio(workspaceId, branchId, ratio);
    },
    [workspaceId],
  );

  return {
    handleSelectTab,
    handleCloseTab,
    handleCreateTab,
    handleReorderTab,
    handleSplitDrop,
    handleFocusPane,
    handleTabDragStart,
    handleTabDragEnd,
    handleSplitRight,
    handleSplitDown,
    handleSplitRatioChange,
  };
}
