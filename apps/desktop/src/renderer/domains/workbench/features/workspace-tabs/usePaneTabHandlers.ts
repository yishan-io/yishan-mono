import type { DesktopAgentKind } from "@renderer/domains/agent";
import type { createNewWhiteboard, renameEntry } from "@renderer/domains/files";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { WorkbenchTab } from "../../../../domains/workbench/types";
import type {
  closeTab,
  openTab,
  renameTab,
  renameTabsForEntryRename,
  setSelectedTab as selectTab,
} from "../../commands/tabCommands";
import type { SplitDropRegion } from "./pane/SplitDropZone";
import { resolveDropResult } from "./pane/SplitDropZone";
import type { TabBarCreateOption } from "./pane/TabBar";

import { splitPaneStore } from "../../state/splitPaneStore";
import { selectActivePane, selectPane } from "../../state/workbenchSelectors";

/** Agent terminal preset metadata for the tab create menu (supplied by the caller; agent-owned). */
export type AgentPresetMeta = {
  /** i18n key for the preset label. */
  labelKey: string;
  /** CLI launch command for the preset. */
  launchCommand: string;
};

/** Tab commands supplied to the pane tab handlers (workbench tab commands + files tab-file commands). */
export type PaneTabHandlersCommands = {
  openTab: typeof openTab;
  closeTab: typeof closeTab;
  selectTab: typeof selectTab;
  renameTab: typeof renameTab;
  renameTabsForEntryRename: typeof renameTabsForEntryRename;
  createNewWhiteboard: typeof createNewWhiteboard;
  renameEntry: typeof renameEntry;
};

export type UsePaneTabHandlersOptions = {
  workspaceId: string;
  workspaceTabs: WorkbenchTab[];
  workspace: { worktreePath?: string } | undefined;
  enabledAgentKindSet: Set<string>;
  agentPresetMeta: Record<string, AgentPresetMeta>;
  cmd: PaneTabHandlersCommands;
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
  agentPresetMeta,
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
      const presetMeta = agentPresetMeta[option];
      if (!presetMeta) return;
      const title = t(presetMeta.labelKey);
      const launchCommand = presetMeta.launchCommand;
      cmd.openTab({
        workspaceId,
        kind: "terminal",
        title,
        launchCommand,
        agentKind: option as DesktopAgentKind,
        reuseExisting: false,
      });
    },
    [cmd, workspaceId, enabledAgentKindSet, agentPresetMeta, t, workspaceWorktreePath],
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
