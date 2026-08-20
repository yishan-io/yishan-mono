import { openEntryInExternalApp } from "@renderer/domains/files";
import { keybindingSettingsStore } from "@renderer/domains/settings";
import { closeTab, openTab, setSelectedTab, workbenchNavigationStore } from "@renderer/domains/workbench";
import { popupStore } from "@renderer/domains/workbench";
import { splitPaneStore, tabStore } from "@renderer/domains/workbench";
import {
  activateWorkspacePane,
  closeWorkspace,
  deleteSelectedFileTreeEntry,
  focusWorkspaceFileTree,
  openCreateWorkspaceDialog,
  openWorkspaceFileSearch,
  toggleLeftPaneVisibility,
  toggleRightPaneVisibility,
  undoFileTreeOperation,
  workspaceStore,
} from "@renderer/domains/workspace";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { getShortcutDefinitions } from "../../shortcuts/keybindings";
import { compileShortcutDefinitions } from "../../shortcuts/shortcutRunner";
import type { ShortcutActionRegistry } from "../../shortcuts/types";
import { startShortcutRuntime } from "./shortcutRuntime";

const WORKSPACE_ROUTE = "/";

/**
 * Narrow action registry for the shortcut runtime (Desktop 11 Phase 46).
 * The members are stable module-level functions; the object identity is
 * constant, so it needs no memoization.
 */
const shortcutActions: ShortcutActionRegistry = {
  activateWorkspacePane,
  closeTab,
  closeWorkspace,
  deleteSelectedFileTreeEntry,
  focusWorkspaceFileTree,
  openCreateWorkspaceDialog,
  openEntryInExternalApp,
  openTab,
  openWorkspaceFileSearch,
  selectTab: setSelectedTab,
  toggleLeftPaneVisibility,
  toggleRightPaneVisibility,
  undoFileTreeOperation,
};

/** Registers centralized workspace shortcuts and keeps handlers in sync with latest context. */
export function useShortcuts(): void {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const tabStoreState = tabStore((state) => state);
  const workspaceStoreState = workspaceStore((state) => state);
  const activeWorkspaceId = workbenchNavigationStore((state) => state.activeWorkspaceId);
  const splitPaneStoreState = splitPaneStore((state) => state);
  const isPopupOpen = popupStore((state) => state.isPopupOpen);
  const overridesById = keybindingSettingsStore((state) => state.overridesById);
  const isCaptureActive = keybindingSettingsStore((state) => state.isCaptureActive);

  const isWorkspaceRoute = location.pathname === WORKSPACE_ROUTE;

  const context = useMemo(
    () => ({
      pathname: location.pathname,
      isWorkspaceRoute,
      isPopupOpen,
      tabStoreState,
      workspaceStoreState,
      activeWorkspaceId,
      splitPaneStoreState,
      terminalTabTitle: t("terminal.title"),
      commands: shortcutActions,
      navigate,
    }),
    [
      isPopupOpen,
      isWorkspaceRoute,
      location.pathname,
      navigate,
      splitPaneStoreState,
      tabStoreState,
      t,
      activeWorkspaceId,
      workspaceStoreState,
    ],
  );

  const contextRef = useRef(context);
  const isMac = window.desktop?.platform === "darwin";
  const definitions = useMemo(() => getShortcutDefinitions(overridesById), [overridesById]);
  const compiledDefinitions = useMemo(() => compileShortcutDefinitions(definitions, isMac), [definitions, isMac]);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    return startShortcutRuntime({
      getCompiledDefinitions: () => compiledDefinitions,
      getContext: () => contextRef.current,
      isCaptureActive: () => isCaptureActive,
    });
  }, [compiledDefinitions, isCaptureActive]);
}
