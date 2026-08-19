import { ACTIONS } from "../contracts/actions";

/**
 * Shortcut id → default key catalog (desktop7 Phase 27 fix).
 *
 * Single source of truth for shortcut key strings. The renderer shortcut
 * registry (`renderer/shortcuts/keybindings.ts`) reads its `keys` from here,
 * and the Electron main process uses it for native-menu accelerators — the
 * main process must never import the renderer registry (which pulls the whole
 * renderer graph into the main bundle).
 */

export const SHORTCUT_KEYS = {
  "open-keybindings": "ctrl+/,command+/",
  "close-keybindings": "esc",
  "new-tab": "ctrl+y,command+y",
  "close-tab": "ctrl+w,command+w",
  "close-selected-workspace": "ctrl+shift+w,command+shift+w",
  "create-workspace": "ctrl+n,command+n",
  "open-terminal": "ctrl+t,command+t",
  "open-agent-chat": "ctrl+shift+a,command+shift+a",
  "open-browser": "ctrl+shift+b,command+shift+b",
  "open-whiteboard": "ctrl+shift+t,command+shift+t",
  "focus-agent-chat-composer": "ctrl+l,command+l",
  "reload-browser-tab": "ctrl+r,command+r",
  "activate-repo-pane": "ctrl+shift+r,command+shift+r",
  "activate-files-pane": "ctrl+shift+f,command+shift+f",
  "activate-changes-pane": "ctrl+shift+g,command+shift+g",
  "activate-pr-pane": "ctrl+shift+p,command+shift+p",
  "toggle-left-pane": "ctrl+b,command+b",
  "select-previous-workspace": "ctrl+command+k",
  "select-next-workspace": "ctrl+command+j",
  "open-file-search": "ctrl+p,command+p",
  [ACTIONS.WORKSPACE_OPEN_SELECTED_IN_EXTERNAL_APP]: "ctrl+o,command+o",
  [ACTIONS.FILE_DELETE]: "ctrl+backspace,ctrl+delete,command+backspace,command+delete",
  [ACTIONS.FILE_UNDO]: "ctrl+z,command+z",
} as const satisfies Record<string, string>;

/** Returns the default key string for one shortcut id, when present. */
export function getShortcutKeysById(id: string): string | undefined {
  return (SHORTCUT_KEYS as Readonly<Record<string, string>>)[id];
}
