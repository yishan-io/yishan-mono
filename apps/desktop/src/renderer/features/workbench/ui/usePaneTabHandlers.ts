import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { FileCommandSurface, WorkbenchCommandSurface } from "../../../app/commands/useCommands";
import type { SplitDropRegion } from "../../../components/SplitDropZone";
import { resolveDropResult } from "../../../components/SplitDropZone";
import type { TabBarCreateOption } from "../../../components/TabBar";
import type { WorkspaceTab } from "../../../features/workbench/model/types";

import type { DesktopAgentKind } from "../../../helpers/agentSettings";
import { AGENT_SETTINGS_LABEL_KEY_BY_KIND, DEFAULT_AGENT_COMMANDS } from "../../../helpers/agentSettings";
import { splitPaneStore } from "../state/splitPaneStore";
import { selectActivePane, selectPane } from "../state/workbenchSelectors";

export type UsePaneTabHandlersOptions = {
  workspaceId: string;
  workspaceTabs: WorkspaceTab[];
  workspace: { worktreePath?: string } | undefined;
  enabledAgentKindSet: Set<DesktopAgentKind>;
  cmd: WorkbenchCommandSurface & FileCommandSurface;
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
  const workspaceWorktreePath = workspace?.worktreePath;

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
      // After unregistering, the surviving/active pane holds the tab the user was
      // viewing. Prefer it over the workspace-wide neighbor so closing a tab in
      // one pane never yanks the other pane's selection (e.g. sub-agent detail
      // tabs closed on the right must leave the left pane's selected tab alone).
      const activePane = selectActivePane(splitPaneStore.getState(), workspaceId);
      cmd.closeTab(tabId, activePane?.selectedTabId ? { preferredSelectedTabId: activePane.selectedTabId } : undefined);
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
      if (option === "agent-chat") {
        cmd.openTab({
          workspaceId,
          kind: "agent-chat",
          title: t("agentChat.title"),
          cwd: workspaceWorktreePath || undefined,
        });
        return;
      }
      if (option === "whiteboard") {
        void cmd.createNewWhiteboard(workspaceId);
        return;
      }
      if (!enabledAgentKindSet.has(option)) return;
      const title = t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[option]);
      const launchCommand = DEFAULT_AGENT_COMMANDS[option];
      cmd.openTab({
        workspaceId,
        kind: "terminal",
        title,
        launchCommand,
        agentKind: option,
        reuseExisting: false,
      });
    },
    [cmd, workspaceId, enabledAgentKindSet, t, workspaceWorktreePath],
  );

  const handleRenameTab = useCallback(
    async (tabId: string, title: string) => {
      const tab = workspaceTabs.find((item) => item.id === tabId);
      if (!tab) return;

      if (tab.kind !== "file") {
        cmd.renameTab(tabId, title, { userRenamed: true });
        return;
      }

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
    [cmd, workspaceTabs, workspaceId, workspaceWorktreePath],
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
      const pane = selectPane(splitPaneStore.getState(), workspaceId, paneId);
      if (pane?.selectedTabId) {
        cmd.selectTab(pane.selectedTabId);
      }
    },
    [workspaceId, cmd],
  );

  const performSplit = useCallback(
    (paneId: string, direction: "horizontal" | "vertical") => {
      const pane = selectPane(splitPaneStore.getState(), workspaceId, paneId);
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
    handleRenameTab,
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
