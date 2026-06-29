/**
 * Stable frontend action identifiers dispatched across desktop layers.
 */
export const ACTIONS = {
  NAVIGATE: "app.navigate",
  CLOSE_TAB: "tab.close",
  OPEN_TERMINAL_TAB: "tab.openTerminal",
  OPEN_BROWSER_TAB: "tab.openBrowser",
  OPEN_AGENT_CHAT_TAB: "tab.openAgentChat",
  FILE_DELETE: "file.delete",
  FILE_UNDO: "file.undo",
  WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP: "workspace.openSelectedInExternalApp",
  TOGGLE_LEFT_PANE: "layout.toggleLeftPane",
  TOGGLE_RIGHT_PANE: "layout.toggleRightPane",
} as const;

/**
 * Frontend action ids supported by renderer and native bridge.
 */
export type AppAction = (typeof ACTIONS)[keyof typeof ACTIONS];

/**
 * Payload shape for one frontend action dispatched through desktop IPC.
 */
export type AppActionPayload =
  | {
      action: typeof ACTIONS.NAVIGATE;
      path: string;
    }
  | {
      action: Exclude<AppAction, typeof ACTIONS.NAVIGATE>;
    };
