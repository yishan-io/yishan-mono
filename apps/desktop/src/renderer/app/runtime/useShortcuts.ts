import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { getShortcutDefinitions } from "../../shortcuts/keybindings";
import { compileShortcutDefinitions } from "../../shortcuts/shortcutRunner";
import { keybindingSettingsStore } from "../../features/settings/state/keybindingSettingsStore";
import { layoutStore } from "../../features/workbench/state/layoutStore";
import { splitPaneStore } from "../../features/workbench/state/splitPaneStore";
import { tabStore } from "../../features/workbench/state/tabStore";
import { workspaceStore } from "../../features/workspace/state/workspaceStore";
import { useCommands } from "../../app/commands/useCommands";
import { startShortcutRuntime } from "./shortcutRuntime";

const WORKSPACE_ROUTE = "/";

/** Registers centralized workspace shortcuts and keeps handlers in sync with latest context. */
export function useShortcuts(): void {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const tabStoreState = tabStore((state) => state);
  const workspaceStoreState = workspaceStore((state) => state);
  const splitPaneStoreState = splitPaneStore((state) => state);
  const isPopupOpen = layoutStore((state) => state.isPopupOpen);
  const commands = useCommands();
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
      splitPaneStoreState,
      terminalTabTitle: t("terminal.title"),
      commands,
      navigate,
    }),
    [
      commands,
      isPopupOpen,
      isWorkspaceRoute,
      location.pathname,
      navigate,
      splitPaneStoreState,
      tabStoreState,
      t,
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
