import { type Menu as ElectronMenu, Menu, type MenuItemConstructorOptions, app } from "electron";
import enCommon from "../../renderer/locales/en/common.json";
import zhCommon from "../../renderer/locales/zh/common.json";
import { getShortcutKeysById } from "../../renderer/shortcuts/keybindings";
import { ACTIONS, type AppActionPayload } from "../../shared/contracts/actions";

type DispatchAppActionOptions = {
  focusApp?: boolean;
};

type ApplicationMenuApi = {
  buildFromTemplate: (template: MenuItemConstructorOptions[]) => unknown;
  setApplicationMenu: (menu: unknown) => void;
};

type ConfigureApplicationMenuInput = {
  dispatchAction?: (payload: AppActionPayload, options?: DispatchAppActionOptions) => void;
  checkForUpdates?: () => void;
  platform?: NodeJS.Platform;
  locale?: string;
  menuApi?: ApplicationMenuApi;
  appName?: string;
  devMode?: boolean;
};

/** Resolves one locale bundle used by native menu labels. */
function resolveMenuLocaleBundle(locale: string): typeof enCommon | typeof zhCommon {
  const normalizedLocale = locale.toLowerCase();
  return normalizedLocale.startsWith("zh") ? zhCommon : enCommon;
}

/** Converts one centralized hotkey string into one Electron accelerator. */
export function toElectronAccelerator(keys: string): string | undefined {
  const combos = keys
    .split(",")
    .map((combo) => combo.trim().toLowerCase())
    .filter((combo) => combo.length > 0);
  const preferredCombo =
    combos.find((combo) => combo.includes("command+")) ?? combos.find((combo) => combo.includes("ctrl+"));
  const combo = preferredCombo ?? combos[0];
  if (!combo) {
    return undefined;
  }

  const tokens = combo
    .split("+")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const key = tokens.at(-1);
  if (!key) {
    return undefined;
  }

  const modifiers = new Set(tokens.slice(0, -1));
  const acceleratorModifiers: string[] = [];

  if (modifiers.has("command") || modifiers.has("ctrl")) {
    acceleratorModifiers.push("CmdOrCtrl");
  }
  if (modifiers.has("shift")) {
    acceleratorModifiers.push("Shift");
  }
  if (modifiers.has("alt")) {
    acceleratorModifiers.push("Alt");
  }

  const acceleratorKey = key.length === 1 ? key.toUpperCase() : key === "backspace" ? "Backspace" : "Delete";
  return [...acceleratorModifiers, acceleratorKey].join("+");
}

/** Resolves one Electron accelerator from shortcut id with one fallback value. */
function resolveShortcutAccelerator(shortcutId: string, fallback: string): string {
  const keys = getShortcutKeysById(shortcutId);
  const accelerator = keys ? toElectronAccelerator(keys) : undefined;
  return accelerator ?? fallback;
}

/** Builds the macOS native menu template using shared renderer labels and shortcuts. */
export function buildApplicationMenuTemplate(input: ConfigureApplicationMenuInput = {}): MenuItemConstructorOptions[] {
  const locale = input.locale ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? "en";
  const localeBundle = resolveMenuLocaleBundle(locale);
  const deleteSelectedFileMenuLabel = localeBundle.nativeMenu?.deleteSelectedFile ?? "Delete Selected File";
  const undoFileOperationMenuLabel = localeBundle.keybindings?.actions?.undoFileTreeOperation ?? "Undo file operation";
  const toggleLeftPaneLabel = localeBundle.layout?.toggleLeftSidebar ?? "Toggle left sidebar";
  const toggleRightPaneLabel = localeBundle.layout?.toggleRightSidebar ?? "Toggle right sidebar";
  const deleteAccelerator = resolveShortcutAccelerator(ACTIONS.FILE_DELETE, "CmdOrCtrl+Backspace");
  const undoAccelerator = resolveShortcutAccelerator(ACTIONS.FILE_UNDO, "CmdOrCtrl+Z");
  const toggleLeftAccelerator = resolveShortcutAccelerator("toggle-left-pane", "CmdOrCtrl+B");
  const helpMenuItems: MenuItemConstructorOptions[] = [
    { label: "Document" },
    { label: "Key shortcut" },
    { label: "Changelogs" },
    { label: "Report an issue" },
  ];

  if (input.devMode) {
    helpMenuItems.push({ role: "toggleDevTools" });
  }

  return [
    {
      label: input.appName ?? app.name,
      submenu: [
        { label: "About Yishan", role: "about" },
        {
          label: "Preferences",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            input.dispatchAction?.({ action: ACTIONS.NAVIGATE, path: "/settings" }, { focusApp: true });
          },
        },
        {
          label: "Check for Updates",
          click: () => {
            input.checkForUpdates?.();
          },
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", accelerator: "CmdOrCtrl+Z" },
        { role: "redo", accelerator: "Shift+CmdOrCtrl+Z" },
        { type: "separator" },
        { role: "cut", accelerator: "CmdOrCtrl+X" },
        { role: "copy", accelerator: "CmdOrCtrl+C" },
        { role: "paste", accelerator: "CmdOrCtrl+V" },
        { role: "pasteAndMatchStyle", accelerator: "Shift+CmdOrCtrl+V" },
        {
          label: undoFileOperationMenuLabel,
          accelerator: undoAccelerator,
          click: () => {
            input.dispatchAction?.({ action: ACTIONS.FILE_UNDO });
          },
        },
        {
          label: deleteSelectedFileMenuLabel,
          accelerator: deleteAccelerator,
          click: () => {
            input.dispatchAction?.({ action: ACTIONS.FILE_DELETE });
          },
        },
        { role: "delete" },
        { role: "selectAll", accelerator: "CmdOrCtrl+A" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: toggleLeftPaneLabel,
          accelerator: toggleLeftAccelerator,
          click: () => {
            input.dispatchAction?.({ action: ACTIONS.TOGGLE_LEFT_PANE });
          },
        },
        {
          label: toggleRightPaneLabel,
          click: () => {
            input.dispatchAction?.({ action: ACTIONS.TOGGLE_RIGHT_PANE });
          },
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "close" }, { type: "separator" }, { role: "front" }],
    },
    {
      label: "Help",
      submenu: helpMenuItems,
    },
  ];
}

/** Applies the native macOS app menu while leaving other platforms unchanged. */
export function configureApplicationMenu(input: ConfigureApplicationMenuInput = {}): void {
  const platform = input.platform ?? process.platform;
  if (platform !== "darwin") {
    return;
  }

  const menuApi: ApplicationMenuApi = input.menuApi ?? {
    buildFromTemplate: Menu.buildFromTemplate,
    setApplicationMenu: (menu) => {
      Menu.setApplicationMenu(menu as ElectronMenu);
    },
  };
  menuApi.setApplicationMenu(menuApi.buildFromTemplate(buildApplicationMenuTemplate(input)));
}
