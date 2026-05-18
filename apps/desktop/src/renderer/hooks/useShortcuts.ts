import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { getShortcutDefinitions } from "../shortcuts/keybindings";
import { compileShortcutDefinitions, processShortcuts } from "../shortcuts/shortcutRunner";
import { layoutStore } from "../store/layoutStore";
import { splitPaneStore } from "../store/splitPaneStore";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { useCommands } from "./useCommands";

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
  const definitions = useMemo(() => getShortcutDefinitions(), []);
  const compiledDefinitions = useMemo(() => compileShortcutDefinitions(definitions), [definitions]);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    const handleWindowKeydown = (event: KeyboardEvent) => {
      processShortcuts(compiledDefinitions, contextRef.current, event);
    };

    window.addEventListener("keydown", handleWindowKeydown, true);
    return () => {
      window.removeEventListener("keydown", handleWindowKeydown, true);
    };
  }, [compiledDefinitions]);
}
