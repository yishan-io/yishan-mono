import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { getShortcutDefinitions } from "../shortcuts/keybindings";
import { compileShortcutDefinitions, processShortcuts } from "../shortcuts/shortcutRunner";
import { subscribeDesktopRpcEvent } from "../rpc/rpcTransport";
import { keybindingSettingsStore } from "../store/settings/keybindingSettingsStore";
import { layoutStore } from "../store/settings/layoutStore";
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
    const handleWindowKeydown = (event: KeyboardEvent) => {
      if (isCaptureActive) {
        return;
      }

      processShortcuts(compiledDefinitions, contextRef.current, event);
    };

    window.addEventListener("keydown", handleWindowKeydown, true);
    const unsubscribeWebviewKeydown = subscribeDesktopRpcEvent((desktopEvent) => {
      if (desktopEvent.method !== "webviewKeydown" || isCaptureActive) {
        return;
      }

      const payload = desktopEvent.payload as
        | {
            key?: string;
            code?: string;
            ctrlKey?: boolean;
            metaKey?: boolean;
            shiftKey?: boolean;
            altKey?: boolean;
          }
        | undefined;

      const syntheticEvent = new KeyboardEvent("keydown", {
        key: payload?.key ?? "",
        code: payload?.code ?? "",
        ctrlKey: Boolean(payload?.ctrlKey),
        metaKey: Boolean(payload?.metaKey),
        shiftKey: Boolean(payload?.shiftKey),
        altKey: Boolean(payload?.altKey),
      });

      processShortcuts(compiledDefinitions, contextRef.current, syntheticEvent);
    });

    return () => {
      window.removeEventListener("keydown", handleWindowKeydown, true);
      unsubscribeWebviewKeydown();
    };
  }, [compiledDefinitions, isCaptureActive]);
}
